import React from 'react';
import EpicComponent from 'epic-component';
import Select from 'react-select';

//Modes should be imported in buffers/index.js
//Label is the name you want to show in the list for the user, value is the name of the mode for Ace
const modes =  [{label : "C++", value: "c_cpp"}, {label : "Python", value:"python"}, {label : "Java", value:"java"}];

export default function (bundle, deps) {

	bundle.use('bufferChangeMode');

  bundle.addReducer('init', state => state.set('aceModes', modes));
  bundle.addReducer('init', setAutoMode);
  function setAutoMode(state)
  {
    var authorisedAceMode = {};
    for (var i = modes.length - 1; i >= 0; i--) {
      authorisedAceMode[modes[i].value] = true;
    }

    console.log(authorisedAceMode);
    return state.set("authorisedAceMode", authorisedAceMode);
  }

  bundle.defineSelector('getAceModesList', function (state) {
    return state.getIn(['aceModes']);
  });

  bundle.defineSelector('getAuthorisedAceModesList', function (state) {
    return state.get('authorisedAceMode');
  });


	function modePickerSelector (state, props) {
    const aceModes = deps.getAceModesList(state);
    return {aceModes};
  }

  bundle.defineView('ModePicker', modePickerSelector, class ModePicker extends React.PureComponent {

    render () {
      const {aceModes} = this.props;
      return <Select options={modes} onChange={this.onSelect} clearableValue={false} />;
    }

    onSelect = (option) => {
      this.props.dispatch({type: deps.bufferChangeMode, buffer: 'source', mode: option.value});
    };

  });




};