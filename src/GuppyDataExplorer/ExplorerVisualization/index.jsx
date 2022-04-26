import React from 'react';
import PropTypes from 'prop-types';
import GuppyWrapper from '@gen3/guppy/dist/components/GuppyWrapper';
import ConnectedFilter from '@gen3/guppy/dist/components/ConnectedFilter';
import SummaryChartGroup from '@gen3/ui-component/dist/components/charts/SummaryChartGroup';
import PercentageStackedBarChart from '@gen3/ui-component/dist/components/charts/PercentageStackedBarChart';
import { components } from '../../params';
import { guppyUrl, tierAccessLevel, tierAccessLimit } from '../../localconf';
import DataSummaryCardGroup from '../../components/cards/DataSummaryCardGroup';
import ExplorerHeatMap from '../ExplorerHeatMap';
import ExplorerTable from '../ExplorerTable';
import ReduxExplorerButtonGroup from '../ExplorerButtonGroup/ReduxExplorerButtonGroup';
import {
  TableConfigType,
  ButtonConfigType,
  ChartConfigType,
  GuppyConfigType,
} from '../configTypeDef';
import { checkForAnySelectedUnaccessibleField } from '../GuppyDataExplorerHelper';
import './ExplorerVisualization.css';
import { labelToPlural } from '../utils';

class ExplorerVisualization extends React.Component {
  constructor(props) {
    super(props);
    this.connectedFilter = React.createRef();
  }

  /**
   * Aggregate and convert raw data to return counts of unique primary key / secondary key pairings
   * for use in stacked percentage bar chart visualization
   * @param {object} rawData
   * @param {string} primaryKey
   * @param {string} secondaryKey
   * Assume raw data is of the form:
   * [{ date: "2020-01-01", variant: "b"},
   *  { date: "2020-01-01", variant: "b"},
   *  { date: "2020-01-01", variant: "c"},
   *  { date: null, variant: "c"}
   * ]
   * Aggregate counts by primaryKey/secondaryKey unique pairings and return:
   * [{ date: "2020-01-01", variant: "b", count: 2},
   *  { date: "2020-01-01", variant: "c", count: 1},
   *  { date: "null", variant: "c", count: 1}]
   */
  createStackedBarData = (rawData, primaryKey, secondaryKey) => {
    // Create a nested hashmap of data like
    // { primaryKey: { secondaryKey: count, secondaryKey: count}}
    // { "2020-01-01": { "b": 2, "c": 1 } }
    const hashTable = {};
    rawData.forEach((item) => {
      const primaryElement = item[primaryKey];
      const secondaryElement = item[secondaryKey];
      // ignore rows with null secondary key
      // PrimaryKeys can have null values, but secondaryKeys cannot
      // e.g. if sorting by date + variant, then dates can be null but variant cannot be null
      if (primaryElement === null) {
        return;
      }
      const primaryData = hashTable[primaryElement];
      if (primaryData === undefined) {
        const secondaryHash = {};
        secondaryHash[secondaryElement] = 1;
        hashTable[primaryElement] = secondaryHash;
      } else {
        const singleVal = primaryData[secondaryElement];
        if (singleVal === undefined) {
          primaryData[secondaryElement] = 1;
        } else {
          primaryData[secondaryElement] = singleVal + 1;
        }
      }
    });

    // flatten the hash table to have a unique primaryKey/ secondaryKey pairing per row
    const mappedData = [];
    Object.keys(hashTable).forEach((primaryKeyVal) => {
      const variants = hashTable[primaryKeyVal];
      Object.keys(variants).forEach((variant) => {
        const itemData = {};
        itemData[primaryKey] = primaryKeyVal;
        itemData[secondaryKey] = variant;
        itemData.value = variants[variant];
        mappedData.push(itemData);
      });
    });
    console.log(mappedData)
    return mappedData;
  }

  getData = (aggsData, chartConfig, filter) => {
    const summaries = [];
    let countItems = [];
    const stackedBarCharts = [];
    countItems.push({
      label: this.props.nodeCountTitle || labelToPlural(this.props.guppyConfig.dataType, true),
      value: this.props.totalCount,
    });
    Object.keys(chartConfig).forEach((field) => {
      if (!aggsData || !aggsData[`${field}`] || !aggsData[`${field}`].histogram) return;
      const { histogram } = aggsData[`${field}`];
      switch (chartConfig[`${field}`].chartType) {
      case 'count':
        countItems.push({
          label: chartConfig[`${field}`].title,
          value: filter[`${field}`] ? filter[`${field}`].selectedValues.length
            : aggsData[`${field}`].histogram.length,
        });
        break;
      case 'pie':
      case 'fullPie':
      case 'bar':
      case 'stackedBar': {
        const dataItem = {
          type: chartConfig[`${field}`].chartType,
          title: chartConfig[`${field}`].title,
          data: histogram.map((i) => ({ name: i.key, value: i.count })),
        };
        if (chartConfig[`${field}`].chartType === 'stackedBar') {
          stackedBarCharts.push(dataItem);
        } else {
          summaries.push(dataItem);
        }
        break;
      }
      case 'stackedDateBar': {
        const { secondaryKey, title } = chartConfig[`${field}`];
        const dataItem = {
          type: 'stackedBar',
          title,
          xAxisFieldName: field,
          yAxisFieldName: secondaryKey,
          data: this.createStackedBarData(this.props.rawData, field, secondaryKey),
        };
        stackedBarCharts.push(dataItem);
        break;
      }
      default:
        throw new Error(`Invalid chartType ${chartConfig[`${field}`].chartType}`);
      }
    });
    // sort cout items according to appearance in chart config
    countItems = countItems.sort((a, b) => {
      const aIndex = Object.values(chartConfig).findIndex((v) => v.title === a.label);
      const bIndex = Object.values(chartConfig).findIndex((v) => v.title === b.label);
      // if one doesn't exist in chart config, put it to front
      if (aIndex === -1) return -1;
      if (bIndex === -1) return 1;
      return aIndex - bIndex;
    });
    return { summaries, countItems, stackedBarCharts };
  }

  updateConnectedFilter = async (heatMapMainYAxisVar) => {
    const caseField = this.props.guppyConfig.manifestMapping.referenceIdFieldInDataIndex;
    let caseIDList;
    try {
      const res = await this.props.downloadRawDataByFields({ fields: [caseField] });
      caseIDList = res.map((e) => e[caseField]);
      this.heatMapIsLocked = false;
    } catch (e) {
      // when tiered access is enabled, we cannot get the list of IDs because
      // the user does not have access to all projects. In that case, the
      // heatmap is not displayed.
      caseIDList = [];
      this.heatMapIsLocked = true;
    }
    this.connectedFilter.current.setFilter(
      { [heatMapMainYAxisVar]: { selectedValues: caseIDList } },
    );
  };

  render() {
    const chartData = this.getData(this.props.aggsData, this.props.chartConfig, this.props.filter);
    const tableColumnsOrdered = (this.props.tableConfig.fields
      && this.props.tableConfig.fields.length > 0);
    const tableColumns = tableColumnsOrdered ? this.props.tableConfig.fields : this.props.allFields;
    // don't lock components for libre commons
    const isComponentLocked = (tierAccessLevel !== 'regular') ? false : checkForAnySelectedUnaccessibleField(this.props.aggsData,
      this.props.accessibleFieldObject, this.props.guppyConfig.accessibleValidationField);
    const lockMessage = `The chart is hidden because you are exploring restricted access data and one or more of the values within the chart has a count below the access limit of ${this.props.tierAccessLimit} ${
      this.props.guppyConfig.nodeCountTitle
        ? this.props.guppyConfig.nodeCountTitle.toLowerCase()
        : labelToPlural(this.props.guppyConfig.dataType)
    }.`;
    const barChartColor = components.categorical2Colors ? components.categorical2Colors[0] : null;

    // heatmap config
    const heatMapGuppyConfig = this.props.heatMapConfig
      ? this.props.heatMapConfig.guppyConfig : null;
    const heatMapMainYAxisVar = (this.props.heatMapConfig
      && this.props.guppyConfig.manifestMapping
      && this.props.guppyConfig.manifestMapping.referenceIdFieldInResourceIndex)
      ? this.props.guppyConfig.manifestMapping.referenceIdFieldInResourceIndex : null;
    const heatMapFilterConfig = {
      tabs: [
        {
          fields: [
            heatMapMainYAxisVar,
          ],
        },
      ],
    };
    if (heatMapGuppyConfig && this.connectedFilter.current) {
      this.updateConnectedFilter(heatMapMainYAxisVar);
    }

    return (
      <div className={this.props.className}>
        <div className='guppy-explorer-visualization__button-group' id='guppy-explorer-data-tools'>
          <ReduxExplorerButtonGroup
            buttonConfig={this.props.buttonConfig}
            guppyConfig={this.props.guppyConfig}
            totalCount={this.props.totalCount}
            downloadRawData={this.props.downloadRawData}
            downloadRawDataByFields={this.props.downloadRawDataByFields}
            getTotalCountsByTypeAndFilter={this.props.getTotalCountsByTypeAndFilter}
            downloadRawDataByTypeAndFilter={this.props.downloadRawDataByTypeAndFilter}
            filter={this.props.filter}
            history={this.props.history}
            location={this.props.location}
            isLocked={isComponentLocked}
            isPending={this.props.aggsDataIsLoading}
          />
        </div>
        {
          chartData.countItems.length > 0 && (
            <div className='guppy-explorer-visualization__summary-cards' id='guppy-explorer-summary-statistics'>
              <DataSummaryCardGroup summaryItems={chartData.countItems} connected />
            </div>
          )
        }
        {
          chartData.summaries.length > 0 && (
            <div className='guppy-explorer-visualization__charts'>
              <SummaryChartGroup
                summaries={chartData.summaries}
                lockMessage={lockMessage}
                barChartColor={barChartColor}
                useCustomizedColorMap={!!components.categorical9Colors}
                customizedColorMap={components.categorical9Colors || []}
              />
            </div>
          )
        }
        {
          chartData.stackedBarCharts.length > 0 && (
            <div className='guppy-explorer-visualization__charts'>
              {
                chartData.stackedBarCharts.map((chart, i) => (
                  <div key={i} className='guppy-explorer-visualization__charts-row'>
                    {
                      i > 0 && <div className='percentage-bar-chart__row-upper-border' />
                    }
                    {
                      <PercentageStackedBarChart
                        key={i}
                        secondaryKey={chart.xAxisFieldName}
                        primaryKey={chart.yAxisFieldName}
                        data={chart.data}
                        title={chart.title}
                        lockMessage={lockMessage}
                        useCustomizedColorMap={!!components.categorical9Colors}
                        customizedColorMap={components.categorical9Colors || []}
                      />
                    }
                  </div>
                ),
                )
              }
            </div>
          )
        }
        {
          heatMapGuppyConfig && (
            <GuppyWrapper
              guppyConfig={{
                path: guppyUrl,
                type: heatMapGuppyConfig.dataType,
                ...heatMapGuppyConfig,
              }}
              filterConfig={heatMapFilterConfig}
              tierAccessLevel={tierAccessLevel}
              tierAccessLimit={tierAccessLimit}
            >
              <ConnectedFilter
                className='guppy-explorer-visualization__connected-filter--hide'
                ref={this.connectedFilter}
                guppyConfig={{
                  path: guppyUrl,
                  type: heatMapGuppyConfig.dataType,
                  ...heatMapGuppyConfig,
                }}
                filterConfig={heatMapFilterConfig}
              />
              <ExplorerHeatMap
                guppyConfig={{
                  path: guppyUrl,
                  type: heatMapGuppyConfig.dataType,
                  ...heatMapGuppyConfig,
                }}
                mainYAxisVar={heatMapMainYAxisVar}
                isLocked={this.heatMapIsLocked}
                lockMessage={'This chart is hidden because it contains data you do not have access to'}
              />
            </GuppyWrapper>
          )
        }
        {
          this.props.tableConfig.enabled && (
            <ExplorerTable
              className='guppy-explorer-visualization__table'
              tableConfig={{
                fields: tableColumns,
                ordered: tableColumnsOrdered,
                linkFields: this.props.tableConfig.linkFields || [],
              }}
              fetchAndUpdateRawData={this.props.fetchAndUpdateRawData}
              rawData={this.props.rawData}
              totalCount={this.props.totalCount}
              guppyConfig={this.props.guppyConfig}
              isLocked={isComponentLocked}
            />
          )
        }
      </div>
    );
  }
}

ExplorerVisualization.propTypes = {
  totalCount: PropTypes.number, // inherited from GuppyWrapper
  aggsData: PropTypes.object, // inherited from GuppyWrapper
  aggsDataIsLoading: PropTypes.bool, // inherited from GuppyWrapper
  filter: PropTypes.object, // inherited from GuppyWrapper
  fetchAndUpdateRawData: PropTypes.func, // inherited from GuppyWrapper
  downloadRawDataByFields: PropTypes.func, // inherited from GuppyWrapper
  downloadRawData: PropTypes.func, // inherited from GuppyWrapper
  getTotalCountsByTypeAndFilter: PropTypes.func, // inherited from GuppyWrapper
  downloadRawDataByTypeAndFilter: PropTypes.func, // inherited from GuppyWrapper
  rawData: PropTypes.array, // inherited from GuppyWrapper
  allFields: PropTypes.array, // inherited from GuppyWrapper
  accessibleFieldObject: PropTypes.object, // inherited from GuppyWrapper
  history: PropTypes.object.isRequired,
  className: PropTypes.string,
  chartConfig: ChartConfigType,
  tableConfig: TableConfigType,
  buttonConfig: ButtonConfigType,
  heatMapConfig: PropTypes.object,
  guppyConfig: GuppyConfigType,
  nodeCountTitle: PropTypes.string,
  tierAccessLimit: PropTypes.number.isRequired,
  location: PropTypes.object.isRequired,
};

ExplorerVisualization.defaultProps = {
  totalCount: 0,
  aggsData: {},
  aggsDataIsLoading: false,
  filter: {},
  fetchAndUpdateRawData: () => {},
  downloadRawDataByFields: () => {},
  downloadRawData: () => {},
  getTotalCountsByTypeAndFilter: () => {},
  downloadRawDataByTypeAndFilter: () => {},
  rawData: [],
  allFields: [],
  accessibleFieldObject: {},
  className: '',
  chartConfig: {},
  tableConfig: {},
  buttonConfig: {},
  heatMapConfig: {},
  guppyConfig: {},
  nodeCountTitle: '',
};

export default ExplorerVisualization;
