import React from 'react';
import {Icon} from '@blueprintjs/core';
import {isLocalMode} from "../utils/app";
import {connect} from "react-redux";
import {AppStore} from "../store";
import {MenuIconsTask} from "./MenuIconsTask";
import {IoMode} from "../stepper/io";
import {recordingEnabledChange} from "./task_slice";
import {StepperStatus} from "../stepper";
import {SettingsDialog} from "../common/SettingsDialog";
import {EditRecordingDialog} from "../editor/EditRecordingDialog";
import {ActionTypes as CommonActionTypes} from "../common/actionTypes";
import {Screen} from "../common/screens";

interface MenuTaskStateToProps {
    getMessage: Function,
    canChangePlatform: boolean,
    platform: string,
    offlineDownloadUrl: string,
    recordingEnabled: boolean,
    playerEnabled: boolean,
    ioMode: IoMode,
    ioModeSelect: boolean,
    editorEnabled: boolean,
    screen: Screen,
}

function mapStateToProps(state: AppStore): MenuTaskStateToProps {
    const {baseUrl, baseDataUrl, platform, canChangePlatform} = state.options;
    const getMessage = state.getMessage;
    const recordingEnabled = state.task.recordingEnabled;
    const playerEnabled = !!state.options.baseDataUrl;
    const {mode: ioMode, modeSelect} = state.ioPane;
    const ioModeSelect = modeSelect && (!state.stepper || state.stepper.status === StepperStatus.Clear);
    const displayEditor = state.editor && state.editor.playerReady;
    const screen = state.screen;

    let offlineDownloadUrl = null;
    if (!isLocalMode() && baseDataUrl) {
        offlineDownloadUrl = baseUrl + '/offline?recording=' + encodeURIComponent(baseDataUrl);
    }

    return {
        getMessage, platform, canChangePlatform, offlineDownloadUrl, recordingEnabled, playerEnabled, ioMode, ioModeSelect,
        screen,
        editorEnabled: displayEditor,
    };
}

interface MenuTaskDispatchToProps {
    dispatch: Function
}

interface MenuTaskState {
    settingsOpen: boolean,
    menuOpen: boolean,
}

interface MenuTaskProps extends MenuTaskStateToProps, MenuTaskDispatchToProps {

}

class _MenuTask extends React.PureComponent<MenuTaskProps, MenuTaskState> {
    state = {
        settingsOpen: false,
        menuOpen: false,
    };

    private wrapperRef: React.RefObject<HTMLDivElement>;

    constructor(props) {
        super(props);

        this.wrapperRef = React.createRef();
        this.setWrapperRef = this.setWrapperRef.bind(this);
        this.handleClickOutside = this.handleClickOutside.bind(this);
    }

    componentDidMount() {
        document.addEventListener('mousedown', this.handleClickOutside);
    }

    componentWillUnmount() {
        document.removeEventListener('mousedown', this.handleClickOutside);
    }

    render() {
        const {getMessage, playerEnabled, editorEnabled, screen} = this.props;
        const {settingsOpen} = this.state;

        return (
            <div ref={this.wrapperRef} className={`menu-container ${this.state.menuOpen ? 'is-open' : ''}`}>
                {screen !== Screen.DocumentationSmall && screen !== Screen.DocumentationBig && <div className="menu-icons">
                    <MenuIconsTask
                        toggleMenu={this.toggleMenu}
                        toggleDocumentation={this.toggleDocumentation}
                    />
                </div>}
                <div className={`task-menu`}>
                    <div className="menu-item" onClick={this.toggleSettings}>
                        <Icon icon="cog"/>
                        <span>{getMessage('MENU_SETTINGS')}</span>
                    </div>
                    {!playerEnabled && <div className="menu-item" onClick={this.toggleRecording}>
                        <Icon icon="record" color="#ff001f"/>
                        <span>{getMessage('MENU_RECORDER')}</span>
                    </div>}
                    {editorEnabled && <div className="menu-item" onClick={this.toggleEditRecording}>
                      <Icon icon="edit"/>
                      <span>{getMessage('MENU_EDIT_RECORDING')}</span>
                    </div>}
                </div>
                <SettingsDialog
                    open={settingsOpen}
                    onClose={this.closeSettings}
                />
                <EditRecordingDialog
                    open={screen === Screen.EditorSave}
                    onClose={this.closeEditRecording}
                />
            </div>
        );
    }

    setWrapperRef(node) {
        this.wrapperRef = node;
    }

    handleClickOutside(event) {
        if (
            this.wrapperRef
            && !this.wrapperRef.current.contains(event.target)
            && !event.target.closest('.bp3-portal')
            && this.state.menuOpen
        ) {
            this.closeMenu();
        }
    }

    toggleSettings = () => {
        this.setState(prevState => ({
            settingsOpen: !prevState.settingsOpen,
        }));
    };

    toggleMenu = () => {
        this.setState(prevState => ({
            menuOpen: !prevState.menuOpen,
        }));
    };

    toggleDocumentation = () => {
        const newScreen = Screen.DocumentationSmall === this.props.screen || Screen.DocumentationBig === this.props.screen ? null : Screen.DocumentationSmall;
        this.props.dispatch({type: CommonActionTypes.AppSwitchToScreen, payload: {screen: newScreen}});
    };

    toggleRecording = () => {
        this.props.dispatch(recordingEnabledChange(!this.props.recordingEnabled));
        this.closeMenu();
    };

    toggleEditRecording = () => {
        this.props.dispatch({type: CommonActionTypes.AppSwitchToScreen, payload: {screen: Screen.EditorSave}});
    };

    closeSettings = () => {
        this.setState({
            settingsOpen: false,
        });
    };

    closeMenu = () => {
        this.setState({
            menuOpen: false,
        });
    };

    closeEditRecording = () => {
        this.props.dispatch({type: CommonActionTypes.AppSwitchToScreen, payload: {screen: null}});
    };
}

export const MenuTask = connect(mapStateToProps)(_MenuTask);
