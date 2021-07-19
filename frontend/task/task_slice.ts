import {createSlice, PayloadAction} from '@reduxjs/toolkit';

export const taskLevels = ['basic', 'easy', 'medium', 'hard'];

export interface TaskState {
    currentLevel?: number,
    recordingEnabled?: boolean,
    state?: any,
    success?: boolean,
    successMessage?: string,
    currentTest?: object,
    inputNeeded?: boolean,
}

export const taskInitialState = {
    currentLevel: null,
    recordingEnabled: false,
    success: false,
    successMessage: null,
    currentTest: null,
    inputNeeded: false,
} as TaskState;

export const taskSlice = createSlice({
    name: 'task',
    initialState: taskInitialState,
    reducers: {
        currentLevelChange(state, action: PayloadAction<number>) {
            state.currentLevel = action.payload;
        },
        recordingEnabledChange(state, action: PayloadAction<boolean>) {
            state.recordingEnabled = action.payload;
        },
        taskSuccess(state: TaskState, action: PayloadAction<string>) {
            state.success = true;
            state.successMessage = action.payload;
        },
        taskSuccessClear(state: TaskState) {
            state.success = false;
            state.successMessage = null;
        },
        updateCurrentTest(state: TaskState, action: PayloadAction<object>) {
            if (state.currentTest) {
                state.currentTest = {
                    ...state.currentTest,
                    ...action.payload,
                };
            } else {
                state.currentTest = action.payload;
            }
        },
        taskInputNeeded(state: TaskState, action: PayloadAction<boolean>) {
            state.inputNeeded = action.payload;
        },
    },
});

export const {
    currentLevelChange,
    recordingEnabledChange,
    taskSuccess,
    taskSuccessClear,
    updateCurrentTest,
    taskInputNeeded,
} = taskSlice.actions;

export const taskRecordableActions = [
    'taskSuccess',
    'taskSuccessClear',
    'taskInputNeeded',
];

export default taskSlice;
