import React from 'react';
import PropTypes from 'prop-types';
import * as ReactMapGL from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

import { mapboxAPIToken } from '../../localconf';
import ControlPanel from '../ControlPanel';
import countyData from '../data/us_counties';
import TimeCaseLayer from '../overlays/TimeCaseLayer';
import MobilityLayer from '../overlays/GoogleMobilityLayer';
import MobilityLayerGnp from '../overlays/GoogleMobilityLayerGnp';
import MobilityLayerPrk from '../overlays/GoogleMobilityLayerPrk';
import MobilityLayerWrk from '../overlays/GoogleMobilityLayerWrk';
import MobilityLayerTrn from '../overlays/GoogleMobilityLayerTrn';
import MobilityLayerRes from '../overlays/GoogleMobilityLayerRes';

import timeData from '../data/jhu_il_json_by_time_latest_new.json';

import MapSlider from '../MapSlider';

function filterCountyGeoJson(selectedFips) {
  return {
    ...countyData,
    features: countyData.features.filter(f => f.properties.STATE === 'IL' && f.properties.FIPS !== '17999' && selectedFips.includes(f.properties.FIPS)),
  };
}

function formatDate(date) {
  let dd = date.getDate();
  let mm = date.getMonth() + 1;
  const y = date.getFullYear();
  if (`${dd}`.length == 1) {
    dd = `0${dd}`;
  }
  if (`${mm}`.length == 1) {
    mm = `0${mm}`;
  }

  const someFormattedDate = `${y}-${mm}-${dd}`;

  return someFormattedDate;
}


class IllinoisMapChart extends React.Component {
  constructor(props) {
    super(props);
    // this.strainData = strainData;
    this.choroCountyGeoJson = null;
    this.strainDataGeoJson = null;
    this._map = null;
    const today = new Date();
    const startDate = new Date(2020, 0, 22);
    const endDate = new Date(today);
    endDate.setDate(endDate.getDate() - 20);
    const dateDiff = Math.floor((today - startDate) / (1000 * 60 * 60 * 24)) - 20;
    this.state = {
      mapSize: {
        width: '100%',
        height: '100%',
      },
      viewport: {
        // start centered on Chicago
        longitude: -90,
        latitude: 40,
        zoom: 6,
        bearing: 0,
        pitch: 0,
      },
      hoverInfo: null,
      _map: null,
      // overlay - title, data, legend stuff - scale, data source, url - hover info
      overlay_layers: {
        time_data: { title: 'Case Data Over Time' },
        rnr_mobility_data: { title: 'Retail & Recreation' },
        gnp_mobility_data: { title: 'Grocery & Pharmacy' },
        prk_mobility_data: { title: 'Parks' },
        trn_mobility_data: { title: 'Transit Stations' },
        wrk_mobility_data: { title: 'Workplaces' },
        res_mobility_data: { title: 'Residential' },
      },
      popup_data: {
        strain_data: { title: 'Strain Data', visible: 'none' },
        // mobility_data : {title: 'Mobility Data', visible: 'none'},
      },
      case_time_data: null,
      sliderValue: dateDiff,
      sliderDate: formatDate(endDate),
      sliderMaxValue: dateDiff,
      activeLayer: 'time_data',
      legendTitle: 'Confirmed Cases',
      legendDataSource: { title: 'Johns Hopkins University CSSE', link: 'https://systems.jhu.edu' },
    };
    this.mapData = {
      modeledCountyGeoJson: null,
      colors: {},
      colorsAsList: null,
    };
  }

  componentDidUpdate() {
    if (!(this.mapData.colorsAsList === null
      && Object.keys(this.props.jsonByLevel.county).length > 0)) {
      return;
    }

    if (!this.state.time_data) {
      const _time_data = this.addTimeDataToGeoJsonBase(timeData.il_county_list);
      this.setState({ time_data: _time_data });
    }

    if (this.mapData.colors !== {}) {
      this.mapData.modeledCountyGeoJson = filterCountyGeoJson(this.props.modeledFipsList);

      // Finds second highest value in data set
      // Second highest value is used to better balance distribution
      // Due to cook county being an extreme outlier
      const maxVal = this.mapData.modeledCountyGeoJson.features
        .map((obj) => {
          const confirmedCases = obj.properties[`C_${this.state.sliderDate}`];
          // this is to handle <5 strings in dataset, makes it 0
          if (typeof confirmedCases === 'string') {
            return 0;
          }
          return confirmedCases;
        })
        .sort((a, b) => b - a)[1];// returning second highest value
        // check if maxVal is a number
      if (typeof maxVal !== 'number') {
        return;
      }
      const maxValExponent = Math.log10(maxVal);
      // Math to calculate Index range for map
      const colorRangeMath = (base) => {
        // applies maxValExponent to base then rounds down to greatest place
        const tempNum = Math.ceil(base ** maxValExponent);
        const roundingDigits = 10 ** (tempNum.toString().length - 1);

        return Math.floor(tempNum / roundingDigits) * roundingDigits;
      };


      this.mapData.colors = [
        [`0 - ${colorRangeMath(2)}`, '#FFF'],
        [`${colorRangeMath(2)} - ${colorRangeMath(3)}`, '#F7F787'],
        [`${colorRangeMath(3)} - ${colorRangeMath(4)}`, '#EED322'],
        [`${colorRangeMath(4)} - ${colorRangeMath(5)}`, '#E6B71E'],
        [`${colorRangeMath(5)} - ${colorRangeMath(6)}`, '#DA9C20'],
        [`${colorRangeMath(6)} - ${colorRangeMath(7)}`, '#CA8323'],
        [`${colorRangeMath(7)} - ${colorRangeMath(8)}`, '#B86B25'],
        [`${colorRangeMath(8)} - ${colorRangeMath(9)}`, '#A25626'],
        [`${colorRangeMath(9)} - ${colorRangeMath(10)}`, '#8B4225'],
        [`${colorRangeMath(10)} +`, '#850001'],
      ];
      this.mapData.colorsAsList = Object.entries(this.mapData.colors)
        .map(item => [+item[0], item[1]]).flat();

      this.setState({ mapColors: this.mapData.colors });
    }

    if (!this.state.mobility_data) {
      fetch('https://covd-map-occ-prc-qa.s3.amazonaws.com/google_mobility.json')
        .then(resp => resp.json())
        .then((data) => {
          const _mobility_data = this.addMobilityDataToGeoJsonBase(data);
          this.setState({ mobility_data: _mobility_data });
        })
        .catch(e => console.warn(e));
    }

    if (!this.state.strainData) {
      fetch('https://covd-map-occ-prc-qa.s3.amazonaws.com/gagnon_lab_strain_data.json')
        .then(resp => resp.json())
        .then((data) => {
          this.setState({ strainData: data });
        })
        .catch(e => console.warn(e));
    }
  }

  addTimeDataToGeoJsonBase(data) {
    // Only select Illinois data.
    // Chicago (FIPS 17999) is separate from Cook county in `countyData`,
    // but not in JHU data. So don't display Chicago separately.
    const base = {
      ...countyData,
      features: countyData.features.filter(f => f.properties.STATE === 'IL' && f.properties.FIPS !== '17999'),
    };
    const geoJson = {
      ...base,
      features: base.features.map((loc) => {
        const location = loc;
        if (location.properties.FIPS && !(location.properties.FIPS in data)) {
          // `countyData` stores FIPS with trailing zeros, JHU data doesn't
          location.properties.FIPS = Number(location.properties.FIPS).toString();
        }
        if (location.properties.FIPS && location.properties.FIPS in data) {
          const dateProps = {};
          Object.entries(data[location.properties.FIPS].by_date).forEach((x) => {
            const [date, caseDeath] = x;
            dateProps[`C_${date}`] = caseDeath.C;
            dateProps[`D_${date}`] = caseDeath.D;
          });
          location.properties = Object.assign(
            dateProps,
            location.properties,
          );
          return location;
        }

        // no data for this location
        return location;
      }),
    };

    return geoJson;
  }

  addMobilityDataToGeoJsonBase(data) {
    // Only select Illinois data.
    // Chicago (FIPS 17999) is separate from Cook county in `countyData`,
    // but not in JHU data. So don't display Chicago separately.
    const base = {
      ...countyData,
      features: countyData.features.filter(f => f.properties.STATE === 'IL' && f.properties.FIPS !== '17999'),
    };
    const geoJson = {
      ...base,
      features: base.features.map((loc) => {
        const location = loc;
        if (location.properties.FIPS && !(location.properties.FIPS in data)) {
          // `countyData` stores FIPS with trailing zeros, JHU data doesn't
          location.properties.FIPS = Number(location.properties.FIPS).toString();
        }
        if (location.properties.FIPS && location.properties.FIPS in data) {
          location.properties = Object.assign(
            data[location.properties.FIPS],
            location.properties,
          );
          return location;
        }

        // no data for this location
        return location;
      }),
    };

    return geoJson;
  }

  sliderOnChange = (value) => {
    const startDate = new Date(2020, 0, 22);
    // this is ugly but it gets the job done
    startDate.setDate(startDate.getDate() + parseInt(value));
    const _sliderDate = startDate;
    let dd = _sliderDate.getDate();
    let mm = _sliderDate.getMonth() + 1;
    const y = _sliderDate.getFullYear();
    if (`${dd}`.length == 1) {
      dd = `0${dd}`;
    }
    if (`${mm}`.length == 1) {
      mm = `0${mm}`;
    }

    const someFormattedDate = `${y}-${mm}-${dd}`;
    this.setState({ sliderDate: someFormattedDate, sliderValue: value });
  }

  onHover = (event) => {
    if (!event.features) { return; }

    let hoverInfo = null;
    const formatNumberToDisplay = (rawNum) => {
      if (rawNum && rawNum !== 'null') {
        if (typeof rawNum === 'number') {
          return rawNum.toLocaleString();
        }
        return rawNum;
      }
      // Default if missing
      return 0;
    };

    event.features.forEach((feature) => {
      if (!feature.layer.id.includes('mobility_data') && feature.layer.id !== 'time-data') {
        return;
      }

      const state = feature.properties.STATE;
      const county = feature.properties.COUNTYNAME;

      let locationName = 'US';
      locationName = (state && state !== 'null' ? `${state}, ` : '') + locationName;
      locationName = (county && county !== 'null' ? `${county}, ` : '') + locationName;

      hoverInfo = {
        lngLat: event.lngLat,
        locationName,
        FIPS: feature.properties.FIPS,
      };

      if (feature.layer.id === 'time-data') {
        const cases = formatNumberToDisplay(feature.properties[`C_${this.state.sliderDate}`]);
        const deaths = formatNumberToDisplay(feature.properties[`D_${this.state.sliderDate}`]);

        const state = feature.properties.STATE;
        const county = feature.properties.COUNTYNAME;
        let locationName = 'US';
        locationName = (state && state !== 'null' ? `${state}, ` : '') + locationName;
        locationName = (county && county !== 'null' ? `${county}, ` : '') + locationName;
        hoverInfo.case_values = {
          'confirmed cases': cases,
          deaths,
        };
      }

      if (feature.layer.id.includes('mobility_data')) {
        const rnr = formatNumberToDisplay(feature.properties[`rnr_${this.state.sliderDate}`]);
        const gnp = formatNumberToDisplay(feature.properties[`gnp_${this.state.sliderDate}`]);
        const prk = formatNumberToDisplay(feature.properties[`prk_${this.state.sliderDate}`]);
        const trn = formatNumberToDisplay(feature.properties[`trn_${this.state.sliderDate}`]);
        const wrk = formatNumberToDisplay(feature.properties[`wrk_${this.state.sliderDate}`]);
        const res = formatNumberToDisplay(feature.properties[`res_${this.state.sliderDate}`]);

        hoverInfo.mobility_values = {
          'Retail & Recreation': rnr,
          'Grocery & Pharmacy': gnp,
          Parks: prk,
          Transit: trn,
          Workplaces: wrk,
          Residential: res,
        };
      }

      if (this.state.popup_data.strain_data.visible === 'visible') {
        hoverInfo.strain_values = this.state.strainData[feature.properties.FIPS][`${this.state.sliderDate}`];
      }
    });

    this.setState({
      hoverInfo,
    });
  };

  onClick = (event) => {
    if (!event.features) { return; }

    event.features.forEach((feature) => {
      if (feature.layer.id === 'confirmed-choropleth') {
        const title = `${feature.properties.county}, ${feature.properties.province_state}`;
        this.props.fetchTimeSeriesData(
          'county',
          feature.properties.FIPS,
          title,
          this.props.modeledFipsList.includes(feature.properties.FIPS),
        );
      }
    });
  }

  setMapLegendColors(id) {
    if (id === 'time_data') {
      this.setState({ mapColors: this.mapData.colors, legendTitle: 'Confirmed Cases', legendDataSource: { title: 'Johns Hopkins University CSSE', link: 'https://systems.jhu.edu' } });
    }
    if (id.includes('mobility_data')) {
      const colors = [
        ['-100% - -80%', '#FFF'],
        ['-80% - -60%', '#F7F787'],
        ['-60% - -40%', '#EED322'],
        ['-40% - -20%', '#E6B71E'],
        ['-20% - 0%', '#DA9C20'],
        ['0% - 20%', '#CA8323'],
        ['20% - 20%', '#B86B25'],
        ['40% - 30%', '#A25626'],
        ['80% - 40%', '#8B4225'],
        ['100% +', '#850001'],
      ];
      this.setState({ mapColors: colors, legendTitle: 'Mobility Data', legendDataSource: { title: 'Google Mobility Data', link: 'https://www.google.com/covid19/mobility/' } });
    }
  }

  onLayerSelect = (event, id) => {
    this.setState({ activeLayer: id });
    this.setMapLegendColors(id);
  }

  onDataSelect = (event, id) => {
    const newState = Object.assign({}, this.state.popup_data);
    newState[id].visible = event.target.checked ? 'visible' : 'none';
    this.setState(newState);
  }

  renderStrainData = (data) => {
    let i;
    for (i = 0; i < cars.length; i++) {
      text += `${cars[i]}<br>`;
    }
  }

  renderHoverPopup() {
    const { hoverInfo } = this.state;

    const formatDataToTable = (data) => {
      let i;
      let tableData;
      for (i = 0; i < Object.entries(data).length; i + 2) {
        text += `${cars[i]}<br>`;
      }
    };
    if (hoverInfo) {
      return (
        <ReactMapGL.Popup
          longitude={hoverInfo.lngLat[0]}
          latitude={hoverInfo.lngLat[1]}
          closeButton={false}
        >
          <div className='location-info'>
            <h4>
              {hoverInfo.locationName}
            </h4>
            {
              hoverInfo.case_values &&
              Object.entries(hoverInfo.case_values).map(
                (val, i) => <p key={i}>{`${val[1]} ${val[0]}`}</p>,
              )
            }
            {
              hoverInfo.mobility_values &&
              Object.entries(hoverInfo.mobility_values).map(
                (val, i) => <p key={i}>{`${val[1]} ${val[0]}`}</p>,
              )
            }
            {
              hoverInfo.strain_values &&
              (
                <table>
                  <caption>Strain Data</caption>
                  {Object.entries(hoverInfo.strain_values).map((val, i) => {
                    const secondCol = Object.entries(hoverInfo.strain_values)[i + 1] || ['', ''];
                    if (i % 2 !== 0) {
                      return (<tr><td key={i}>{`${val[0]} ${val[1]}`}</td><td>{`${secondCol[0]} ${secondCol[1]}`}</td></tr>);
                    }
                  },
                  )}
                </table>
              )
            }
            <p className='covid19-dashboard__location-info__click'>
              Click for real time plotting {this.props.modeledFipsList.includes(hoverInfo.FIPS) ? '\nand simulations' : ''}
            </p>
          </div>
        </ReactMapGL.Popup>
      );
    }
    return null;
  }

  render() {
    return (
      <div className='map-chart'>
        {this.state.mapColors &&
        <ControlPanel
          showMapStyle={false}
          showLegend
          colors={this.state.mapColors}
          lastUpdated={this.props.jsonByLevel.last_updated}
          layers={this.state.overlay_layers}
          dataPoints={this.state.popup_data}
          activeLayer={this.state.activeLayer}
          onLayerSelectChange={this.onLayerSelect}
          onDataSelectChange={this.onDataSelect}
          legendTitle={this.state.legendTitle}
          legendDataSource={this.state.legendDataSource}
        />}

        <ReactMapGL.InteractiveMap
          className='.map-chart__mapgl-map'
          mapboxApiAccessToken={mapboxAPIToken}
          mapStyle='mapbox://styles/mapbox/streets-v11'
          {...this.state.viewport}
          {...this.state.mapSize} // after viewport to avoid size overwrite
          onViewportChange={(viewport) => {
            this.setState({ viewport });
          }}
          onHover={this.onHover}
          onClick={this.onClick}
          dragRotate={false}
          touchRotate={false}
        >
          {this.renderHoverPopup()}

          <TimeCaseLayer visibility={this.state.activeLayer === 'time_data' ? 'visible' : 'none'} data={this.state.time_data} date={this.state.sliderDate} />
          {this.state.mobility_data && <MobilityLayer visibility={this.state.activeLayer === 'rnr_mobility_data' ? 'visible' : 'none'} data={this.state.mobility_data} date={this.state.sliderDate} />}
          {this.state.mobility_data && <MobilityLayerGnp visibility={this.state.activeLayer === 'gnp_mobility_data' ? 'visible' : 'none'} data={this.state.mobility_data} date={this.state.sliderDate} />}
          {this.state.mobility_data && <MobilityLayerPrk visibility={this.state.activeLayer === 'prk_mobility_data' ? 'visible' : 'none'} data={this.state.mobility_data} date={this.state.sliderDate} />}
          {this.state.mobility_data && <MobilityLayerWrk visibility={this.state.activeLayer === 'wrk_mobility_data' ? 'visible' : 'none'} data={this.state.mobility_data} date={this.state.sliderDate} />}
          {this.state.mobility_data && <MobilityLayerTrn visibility={this.state.activeLayer === 'trn_mobility_data' ? 'visible' : 'none'} data={this.state.mobility_data} date={this.state.sliderDate} />}
          {this.state.mobility_data && <MobilityLayerRes visibility={this.state.activeLayer === 'res_mobility_data' ? 'visible' : 'none'} data={this.state.mobility_data} date={this.state.sliderDate} />}
          {/* Outline a set of counties */}
          <ReactMapGL.Source type='geojson' data={this.mapData.modeledCountyGeoJson}>
            <ReactMapGL.Layer
              id='county-outline'
              type='line'
              beforeId='waterway-label'
              paint={{
                'line-color': '#421C52',
                'line-width': 1.5,
              }}
            />
          </ReactMapGL.Source>

        </ReactMapGL.InteractiveMap>
        {<MapSlider title={`View data by date: ${this.state.sliderDate}`} value={this.state.sliderValue} maxValue={this.state.sliderMaxValue} onChange={this.sliderOnChange.bind(this)} />}
      </div>
    );
  }
}

IllinoisMapChart.propTypes = {
  jsonByLevel: PropTypes.object.isRequired,
  modeledFipsList: PropTypes.array.isRequired,
  fetchTimeSeriesData: PropTypes.func.isRequired,
};

export default IllinoisMapChart;
