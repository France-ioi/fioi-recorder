
import React from 'react';
import {Button, Panel} from 'react-bootstrap';
import classnames from 'classnames';
import {modes} from "./aceMode.js"

class MainView extends React.PureComponent {
  render () {
    const {
      diagnostics, readOnly, sourceMode, sourceRowHeight,
      preventInput, haveStepper, error, options, getMessage, geometry, panes,
      StackView, BufferEditor, ArduinoPanel, DirectivesPane, IOPane} = this.props;
    const sourcePanelHeader = (
      <span>
        {getMessage('SOURCE')}
        {haveStepper && <span>{' '}<i className="fa fa-lock"/></span>}
      </span>
    );
    const diagnosticsPanelHeader = (
      <div>
        <div className="pull-right">
          <Button className="close" onClick={this._onClearDiagnostics}>×</Button>
        </div>
        <span>{getMessage('MESSAGES')}</span>
      </div>
    );
    const stepperErrorPanelHeader = (
      <div>
        <div className="pull-right">
          <Button className="close" onClick={this._onStepperExit}>×</Button>
        </div>
        <span>{getMessage('ERROR')}</span>
      </div>
    );
    return (
      <div id='mainView' className={classnames([`mainView-${geometry.size}`])}>
        <div style={{width: `${geometry.width}px`}}>
          <div className="row">
            {StackView && <div className="col-sm-3">
              <Panel header={<span>{getMessage('VARIABLES')}</span>}>
                {<StackView height={sourceRowHeight}/>}
              </Panel>
            </div>}
            <div className={StackView ? "col-sm-9" : "col-sm-12"}>
              <Panel header={sourcePanelHeader}>
                <BufferEditor buffer='source' readOnly={readOnly} shield={preventInput}
                  mode={sourceMode} theme={'textmate'} width='100%' height={sourceRowHeight} globalName='source' />
              </Panel>
            </div>
          </div>
          {diagnostics && <div className="row">
            <div className="col-sm-12">
              <Panel header={diagnosticsPanelHeader} bsStyle="danger">
                <div dangerouslySetInnerHTML={diagnostics}/>
              </Panel>
            </div>
          </div>}
          {error && <div className="row">
            <div className="col-sm-12">
              <Panel header={stepperErrorPanelHeader} bsStyle="danger">
                <pre>{error}</pre>
              </Panel>
            </div>
          </div>}
          {ArduinoPanel && <div className="row">
            <div className="col-sm-12">
              <Panel header={
                <span>
                  <i className="fa fa-microchip"/>
                  {" Arduino"}
                  {haveStepper && <span>{' '}<i className="fa fa-lock"/></span>}
                </span>}>
                <ArduinoPanel preventInput={preventInput}/>
              </Panel>
            </div>
          </div>}
          <div className="row">
            <div className="col-sm-12">
              {DirectivesPane && <DirectivesPane scale={geometry.svgScale}/>}
              {IOPane && <IOPane preventInput={preventInput}/>}
            </div>
          </div>
        </div>
      </div>
    );
  };
  _onClearDiagnostics = () => {
    this.props.dispatch({type: this.props.translateClearDiagnostics});
  };
  _onStepperExit = () => {
    this.props.dispatch({type: this.props.stepperExit});
  };
}

export default function (bundle, deps) {

  bundle.use(
    'getTranslateDiagnostics', 'getStepperDisplay', 'getStepperOptions',
    'translateClearDiagnostics', 'stepperExit',
    'BufferEditor', 'StackView', 'DirectivesPane', 'IOPane',
    'ArduinoConfigPanel', 'ArduinoPanel', "getAuthorisedAceModesList"
  );

  function MainViewSelector (state, props) {
    //console.log(modes);
    const getMessage = state.get('getMessage');
    const geometry = state.get('mainViewGeometry');
    const panes = state.get('panes');
    const diagnostics = deps.getTranslateDiagnostics(state);
    const stepperDisplay = deps.getStepperDisplay(state);
    const haveStepper = !!stepperDisplay;
    const error = haveStepper && stepperDisplay.error;
    const readOnly = haveStepper || props.preventInput;
    const options = deps.getStepperOptions(state);
    const {translateClearDiagnostics, stepperExit} = deps;
    const arduinoEnabled = options.get('arduino');
    const authorisedLang = deps.getAuthorisedAceModesList(state);
    const setLang = state.get('bufferLanguage.options');

    const lang = (setLang in authorisedLang) ? setLang  : "c_cpp";
    const sourceRowHeight = '300px';
    const sourceMode = arduinoEnabled ? 'arduino' : lang;
    return {
      diagnostics, haveStepper, readOnly, error, options, getMessage, geometry, panes,
      translateClearDiagnostics, stepperExit,
      BufferEditor: deps.BufferEditor, sourceRowHeight, sourceMode,
      StackView: options.get('showStack') && deps.StackView,
      ArduinoPanel: arduinoEnabled && deps.ArduinoPanel,
      DirectivesPane: options.get('showViews') && deps.DirectivesPane,
      IOPane: options.get('showIO') && deps.IOPane
    };
  }

  bundle.defineView('MainView', MainViewSelector, MainView);

};
