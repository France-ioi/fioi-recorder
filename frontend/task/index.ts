import {extractLevelSpecific} from "./utils";
import StringRotation from './fixtures/14_strings_05_rotation';
import {Bundle} from "../linker";
import {ActionTypes as RecorderActionTypes} from "../recorder/actionTypes";
import {call, put, select, takeEvery, all, fork} from "redux-saga/effects";
import {getRecorderState} from "../recorder/selectors";
import {App} from "../index";
import {PrinterLib} from "./libs/printer/printer_lib";
import {AppAction} from "../store";
import {quickAlgoLibraries, QuickAlgoLibraries, QuickAlgoLibrary} from "./libs/quickalgo_librairies";
import taskSlice, {
    currentLevelChange,
    recordingEnabledChange, taskLevels, taskRecordableActions,
    TaskState,
    updateCurrentTest
} from "./task_slice";
import {addAutoRecordingBehaviour} from "../recorder/record";
import {ReplayContext} from "../player/sagas";
import DocumentationBundle from "./documentation";

export enum TaskActionTypes {
    TaskLoad = 'task/load',
    TaskLoaded = 'task/loaded',
    TaskReset = 'task/reset',
    TaskInputEntered = 'task/inputEntered',
}

export interface TaskResetAction extends AppAction {
    type: TaskActionTypes.TaskReset;
    payload: TaskState;
}

export interface TaskInputEnteredAction extends AppAction {
    type: TaskActionTypes.TaskInputEntered;
    payload: string;
}

export const taskLoad = () => ({
    type: TaskActionTypes.TaskLoad,
});

export const taskLoaded = () => ({
    type: TaskActionTypes.TaskLoaded,
});

export const taskReset = (
    taskData: TaskState,
): TaskResetAction => ({
    type: TaskActionTypes.TaskReset,
    payload: taskData,
});

export const taskInputEntered = (
    input: string
): TaskInputEnteredAction => ({
    type: TaskActionTypes.TaskInputEntered,
    payload: input,
});

// @ts-ignore
if (!String.prototype.format) {
    // @ts-ignore
    String.prototype.format = function() {
        let str = this.toString();
        if (!arguments.length) {
            return str;
        }

        let args = typeof arguments[0];
        args = (("string" == args || "number" == args) ? arguments : arguments[0]);

        for (let arg in args as any) {
            str = str.replace(RegExp("\\{" + arg + "\\}", "gi"), args[arg]);
        }

        return str;
    }
}

const subTask = StringRotation;
const currentLevel = 1;

function* createContext (quickAlgoLibraries: QuickAlgoLibraries) {
    const currentLevel = yield select(state => state.task.currentLevel);
    const levelGridInfos = extractLevelSpecific(subTask.gridInfos, taskLevels[currentLevel]);
    const display = true;

    try {
        const printerLib = new PrinterLib(display, levelGridInfos);
        quickAlgoLibraries.addLibrary(printerLib, 'printer');
    } catch (e) {
        const defaultLib = new QuickAlgoLibrary(display, levelGridInfos);
        quickAlgoLibraries.addLibrary(defaultLib, 'default');
    }

    const testData = getTaskTest(currentLevel);
    console.log('create context', testData);
    yield put(updateCurrentTest(testData));
    quickAlgoLibraries.reset(testData);
}

function getTaskTest(currentLevel: number) {
    return subTask.data[taskLevels[currentLevel]][0];
}

export function getAutocompletionParameters (context) {
    const curIncludeBlocks = extractLevelSpecific(context.infos.includeBlocks, taskLevels[currentLevel]);

    return {
        includeBlocks: curIncludeBlocks,
        strings: context.strings,
        constants: context.customConstants,
    };
}

export default function (bundle: Bundle) {
    bundle.include(DocumentationBundle);

    bundle.addSaga(function* (app: App) {
        yield takeEvery(TaskActionTypes.TaskLoad, function* () {
            yield put(currentLevelChange(1));
            yield call(createContext, quickAlgoLibraries);
            yield put(taskLoaded());
            const sagas = quickAlgoLibraries.getSagas(app);
            yield fork(function* () {
                yield all(sagas);
            });
        });

        yield takeEvery(recordingEnabledChange.type, function* (payload) {
            if (!payload) {
                return;
            }

            const state = yield select();
            const recorderState = getRecorderState(state);
            if (!recorderState.status) {
                yield put({type: RecorderActionTypes.RecorderPrepare});
            }
        });
    });

    bundle.defer(function(app: App) {
        addAutoRecordingBehaviour(app, {
            sliceName: taskSlice.name,
            actionNames: taskRecordableActions,
            actions: taskSlice.actions,
            reducers: taskSlice.caseReducers,
            onResetDisabled: true,
        });

        const context = quickAlgoLibraries.getContext();

        app.replayApi.on('start', function(replayContext: ReplayContext) {
            replayContext.state.task = {
                currentLevel,
                currentTest: getTaskTest(currentLevel),
                state: context && context.getCurrentState ? {...context.getCurrentState()} : {},
            };
        });
    });
}
