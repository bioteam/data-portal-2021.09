/* eslint-disable */
import { connect } from 'react-redux';
import ProjectSubmission from './ProjectSubmission';
import SubmitTSV from './SubmitTSV';
import SubmitForm from './SubmitForm';
import sessionMonitor from '../SessionMonitor';
import ReduxDataModelGraph, { getCounts } from '../DataModelGraph/ReduxDataModelGraph';
import Papa from 'papaparse';

import { fetchWithCreds } from '../actions';
import { predictFileType } from '../utils';
import { submissionApiPath, lineLimit, apiPath } from '../localconf';

export const uploadTSV = (value, type) => (dispatch) => {
  dispatch({
    type: 'REQUEST_UPLOAD',
    file: value,
    file_type: type,
  });
};

export const updateFormSchema = (formSchema) => ({
  type: 'UPDATE_FORM_SCHEMA',
  formSchema,
});

export const updateFileContent = (value, fileType) => (dispatch) => {
  dispatch({
    type: 'UPDATE_FILE',
    file: value,
    file_type: predictFileType(value, fileType),
  });
};

// fetch all program names from peregrine
const fetchPrograms = () => (dispatch) => fetchWithCreds({
  path: `${submissionApiPath}graphql`,
  body: JSON.stringify({
    query: 'query { program(first:0) {name, id}}',
  }),
  method: 'POST',
})
  .then(
    ({
      status,
      data,
    }) => {
      switch (status) {
      case 200:
        return {
          type: 'RECEIVE_PROGRAMS',
          data: data.data.program,
          status,
        };
      default:
        return {
          type: 'FETCH_ERROR',
          error: data,
          status,
        };
      }
    })
  .then((msg) => dispatch(msg));

const promiseMemoize = (fn, cache) => {
  return (...args) => {
    let strX = JSON.stringify(args);
    return strX in cache ? cache[strX]
      : (cache[strX] = fn(...args).catch((x) => {
          delete cache[strX];
          return x;
        }));
  };
};


const submitToServer = (fullProject, methodIn = 'PUT') => async (dispatch, getState) => {
  const fileArray = [];
  const path = fullProject.split('-');
  const program = path[0];
  const project = path.slice(1).join('-');
  const { submission } = getState();
  const method = path === 'graphql' ? 'POST' : methodIn;
  let { file } = submission;

  dispatch({
    type: 'RESET_SUBMISSION_STATUS',
  });


    /*
    logic:
    user submits tsv of cases
    on TSV submit: scan for records of type=case
    if submitter_id is empty, generate new one
    query case (project_id=tsv.project_id): submitter_id
    last 4 digits, parse as int, inc +1, set for new case
    submit
    */
  let cache = {};

  const fetchCaseForSubmitterIDGen = promiseMemoize((projID) => {
    return fetchWithCreds({
      path: `${apiPath}v0/submission/graphql/`,
      method: "POST",
      body: JSON.stringify({
        query: `query {
            case(project_id: "${projID}", first: 1, order_by_desc:"submitter_id") {
              id
              submitter_id
              projects {
                dbgap_accession_number
              }
            }
          }`,
        variables: null
      })
    });
  }, cache);


  // Is this a JSON submission?
  if ( submission.file_type !== 'text/tab-separated-values' ) {
    try {
      const fileParsedJSON = JSON.parse(file);     
    
      // only for case nodes
      if ( fileParsedJSON["type"] === "case" ) {
      
          const projID = `${program}-${project}`;

          fileParsedJSON.submitter_id = await fetchCaseForSubmitterIDGen(projID).then(({ status, data }) => {
            switch (status) {
            case 200:
              const lastFourInt = parseInt(data.data.case[0].submitter_id.slice(-4), 10) + 1;

              const dbGapNumPrefix = data.data.case[0].projects[0].dbgap_accession_number;

              // padding
              return `${dbGapNumPrefix}${("0000" + lastFourInt).slice(-4)}`;
            default:
              return fileParsedJSON.submitter_id;
            }
          });

          file = JSON.stringify(fileParsedJSON);
      }
    } catch(e) {
      if ( e.message.includes("submitter_id") ) {
        return alert('error processing case submitter_id generation: no parent projects found for case: ' + file);
      } else {
        return alert('error processing case submitter_id generation: ' + e.message);
      }
    }
  } else {
    const parserConfig =  {
      delimiter: "\t",
      header: true
    };

    const parsed = Papa.parse(file, parserConfig);

    const submitterIsRequired = parsed.meta.fields.find(o => o === "*submitter_id");
    const projectIsRequired = parsed.meta.fields.find(o => o === "*project_id");
    const typeIsRequired = parsed.meta.fields.find(o => o === "*type");

    const submitterFieldName = submitterIsRequired ? "*submitter_id" : "submitter_id";
    const projectFieldName = projectIsRequired ? "*project_id" : "project_id";
    const typeFieldName = typeIsRequired ? "*type" : "type";

    const inxMap = {};
  
    try {
      const newRows = await Promise.all(parsed.data.map(async (row) => {
        // only for case nodes
        if ( row[typeFieldName] !== "case" ) return row;
        
        let newID = row[submitterFieldName];
        const projID = row[projectFieldName];
    
        if ( !inxMap[projID] ) inxMap[projID] = 1;
    
        if ( newID === "" ) {
          newID = await fetchCaseForSubmitterIDGen(projID).then(({ status, data }) => {
            switch (status) {
            case 200:
              const lastFourInt = parseInt(data.data.case[0].submitter_id.slice(-4), 10) + inxMap[projID];
              inxMap[projID] += 1;
    
              const dbGapNumPrefix = data.data.case[0].projects[0].dbgap_accession_number;
    
              // padding
              return `${dbGapNumPrefix}${("0000" + lastFourInt).slice(-4)}`;
            default:
              return row.submitter_id;
            }
          });
        }
    
        return {...row, [submitterFieldName]: newID};
      }));
    
      file = Papa.unparse(newRows, parserConfig);
    } catch(e) {
      if ( e.message.includes("submitter_id") ) {
        return alert('error processing case submitter_id generation: no parent projects found for case');
      } else {
        return alert('error processing case submitter_id generation: ' + e.message);
      }
    }
  }

  if (!file) {
    return Promise.reject('No file to submit');
  } if (submission.file_type !== 'text/tab-separated-values') {
    // remove line break in json file
    file = file.replace(/\r\n?|\n/g, '');
  }

  if (submission.file_type === 'text/tab-separated-values') {
    const fileSplited = file.split(/\r\n?|\n/g);
    if (fileSplited.length > lineLimit && lineLimit > 0) {
      let fileHeader = fileSplited[0];
      fileHeader += '\n';
      let count = lineLimit;
      let fileChunk = fileHeader;

      for (let i = 1; i < fileSplited.length; i += 1) {
        if (fileSplited[i] !== '') {
          fileChunk += fileSplited[i];
          fileChunk += '\n';
          count -= 1;
        }
        if (count === 0) {
          fileArray.push(fileChunk);
          fileChunk = fileHeader;
          count = lineLimit;
        }
      }
      if (fileChunk !== fileHeader) {
        fileArray.push(fileChunk);
      }
    } else {
      fileArray.push(file);
    }
  } else {
    fileArray.push(file);
  }

  let subUrl = submissionApiPath;
  if (program !== '_root') {
    subUrl = `${subUrl + program}/${project}/`;
  }

  const totalChunk = fileArray.length;

  function recursiveFetch(chunkArray) {
    if (chunkArray.length === 0) {
      return null;
    }
    return fetchWithCreds({
      path: subUrl,
      method,
      customHeaders: {
        'Content-Type': submission.file_type,
      },
      body: chunkArray.shift(),
      dispatch,
    }).then(recursiveFetch(chunkArray)).then(
      ({
        status,
        data,
      }) => ({
        type: 'RECEIVE_SUBMISSION',
        submit_status: status,
        data,
        total: totalChunk,
      }),
    ).then((msg) => dispatch(msg))
      .then(sessionMonitor.updateUserActivity());
  }

  return recursiveFetch(fileArray);
};

const ReduxSubmitTSV = (() => {
  const mapStateToProps = (state) => ({
    submission: state.submission,
    dictionary: state.dictionary,
  });

  const mapDispatchToProps = (dispatch) => ({
    onUploadClick: (value, type) => dispatch(uploadTSV(value, type)),
    onSubmitClick: (project) => dispatch(submitToServer(project)),
    onFileChange: (value) => dispatch(updateFileContent(value)),
    onFinish: (type, project, dictionary) => dispatch(getCounts(type, project, dictionary)),
  });

  return connect(mapStateToProps, mapDispatchToProps)(SubmitTSV);
})();

const ReduxSubmitForm = (() => {
  const mapStateToProps = (state) => ({
    submission: state.submission,
  });

  const mapDispatchToProps = (dispatch) => ({
    onUploadClick: (value, type) => dispatch(uploadTSV(value, type)),
    onUpdateFormSchema: ((formSchema) => dispatch(updateFormSchema(formSchema))),
  });

  return connect(mapStateToProps, mapDispatchToProps)(SubmitForm);
})();

const ReduxProjectSubmission = (() => {
  const mapStateToProps = (state, ownProps) => ({
    typeList: state.submission.nodeTypes,
    dataIsReady: !!state.submission.counts_search,
    dictionary: state.submission.dictionary,
    submitForm: ReduxSubmitForm,
    submitTSV: ReduxSubmitTSV,
    dataModelGraph: ReduxDataModelGraph,
    project: ownProps.params.project,
    userAuthMapping: state.userAuthMapping,
    projectList: state.submission.projects,
    programList: state.submission.programs,
  });

  const mapDispatchToProps = (dispatch) => ({
    onGetCounts: (typeList, project, dictionary) => dispatch(getCounts(typeList, project, dictionary)),
    fetchPrograms: () => dispatch(fetchPrograms()),
  });
  return connect(mapStateToProps, mapDispatchToProps)(ProjectSubmission);
})();

export default ReduxProjectSubmission;
