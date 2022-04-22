import React, { Component } from 'react';
import {
  Switch, Space, Select, Typography,
} from 'antd';
import PropTypes from 'prop-types';
import { jsonToString } from '../utils';
import SubmitNodeForm from './SubmitNodeForm';
import './SubmitForm.less';

const { Option } = Select;
const { Title } = Typography;
/**
 * Form-based data submission.  The results of this form submission are subsequently
 * processed by the SubmitTSV component, and treated
 * the same way uploaded tsv/json data is treated.
 */
class SubmitForm extends Component {
  constructor(props) {
    super(props);
    this.state = {
      chosenNode: { value: null, label: '' },
      fill_form: false,
      form: {},
    };
  }

  onFormToggle = () => {
    this.setState((prevState) => ({
      fill_form: !(prevState.fill_form),
    }));
  };

  onChange = (event) => {
    const { target } = event;
    this.setState((prevState) => {
      const value = target.type === 'checkbox' ? target.checked : target.value;
      const { name } = target;
      return {
        form: {
          ...prevState.form,
          [name]: value,
        },
      };
    });
  };

  onChangeEnum = (name, newValue) => {
    this.setState((prevState) => ({
      form: {
        ...prevState.form,
        [name]: newValue,
      },
    }));
  };

  onChangeAnyOf = (name, event, properties) => {
    const { target } = event;
    this.setState((prevState) => {
      const value = target.type === 'checkbox' ? target.checked : target.value;
      // get real subname because we have to change the name of each text input so they are unique
      const subname = target.name.replace(`${name}_`, '');

      if (prevState.form[name] === null || prevState.form[name] === undefined) {
        return {
          form: {
            ...prevState.form,
            [name]: [{ [subname]: value }],
          },
        };
      } if (properties.every((prop) => prop in prevState.form[name])) {
        return {
          form: {
            ...prevState.form,
            [name]: prevState.form[name].push({ [subname]: value }),
          },
        };
      }
      return {
        form: {
          ...prevState.form,
          [name]: [...prevState.form[name].slice(0, prevState.form[name].length - 2),
            { ...prevState.form[name][prevState.form[name].length - 1], [subname]: value }],
        },
      };
    });
  };

  handleSubmit = () => {
    const value = jsonToString(this.state.form, this.props.submission.formSchema);
    this.props.onUploadClick(value, 'application/json');
  };

  render() {
    const { dictionary } = this.props.submission;
    const { nodeTypes } = this.props.submission;
    const node = dictionary[this.state.chosenNode.value];
    // const options = nodeTypes.map((nodeType) => ({ value: nodeType, label: nodeType }));
    const options = [{ value: 'case', label: 'case' }, { value: 'cdph', label: 'cdph' }, { value: 'lab', label: 'lab' }];

    const updateChosenNode = (newValue) => {
      this.setState({
        chosenNode: (newValue) ? { value: newValue, label: newValue } : { value: null, label: '' },
        form: (newValue) ? { type: newValue } : {},
      });
    };

    return (
      <div>
        <p>
        <span>
            <b>Partners:</b>
            Download the Case JSON or TSV template and enter your specimen information.<br />
            Once all fields are completed, click on the Submit button to upload your file.<br />
            RIPHL IDs will be provided once all cases are uploaded.<br />
            Alternatively, you can enter each sample using the webform found on the Submit page.<br />
          </span>
          <span>
            <b>CDPH staff:</b>
            Download the CDPH JSON or TSV template and enter your specimen information.<br />
            Once all fields are completed, click on the Submit button to upload your file.<br />
          </span>
          <span>
            <b>RIPHL staff:</b>
            Download the LAB JSON or TSV template and enter your specimen information.<br />
            Once all fields are completed, click on the Submit button to upload your file.<br />
          </span>
        </p>
        <Space direction='vertical' style={{ width: '40%' }}>
          <form>
            <Space direction='vertical' style={{ width: '100%' }}>
              <Space>
                Use Webform
                <Switch className='submit-form__switch' onChange={this.onFormToggle} />
              </Space>
              {this.state.fill_form && (
                <Select
                  size={'large'}
                  showSearch
                  allowClear
                  value={this.state.chosenNode.value}
                  onChange={updateChosenNode}
                  className='submit-form__select'
                >
                  {options.map((opt) => (
                    <Option key={opt.value} value={opt.value}>{opt.label}</Option>
                  ))}
                </Select>
              )}
            </Space>
          </form>
          {(this.state.chosenNode.value !== null) && this.state.fill_form
            && (
              <div className='submit-form__content'>
                <Title level={4}>Properties:</Title>
                <span className='submit-form__required-notification'> * Denotes Required Property </span>
                <SubmitNodeForm
                  node={node}
                  form={this.state.form}
                  properties={Object.keys(node.properties)
                    .filter((prop) => node.systemProperties.indexOf(prop) < 0)}
                  requireds={('required' in node) ? node.required : []}
                  onChange={this.onChange}
                  onChangeEnum={this.onChangeEnum}
                  onChangeAnyOf={this.onChangeAnyOf}
                  onUpdateFormSchema={this.props.onUpdateFormSchema}
                  handleSubmit={this.handleSubmit}
                />
              </div>
            )}
        </Space>
      </div>
    );
  }
}

SubmitForm.propTypes = {
  submission: PropTypes.object.isRequired,
  onUploadClick: PropTypes.func.isRequired,
  onUpdateFormSchema: PropTypes.func.isRequired,
};

export default SubmitForm;
