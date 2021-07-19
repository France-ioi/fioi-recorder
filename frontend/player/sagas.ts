// An instant has shape {t, eventIndex, state},
// where state is an Immutable Map of shape {source, input, syntaxTree, stepper, stepperInitial}
// where source and input are buffer models (of shape {document, selection, firstVisibleRow}).

import {buffers, eventChannel} from 'redux-saga';
import {call, fork, put, race, select, take, takeLatest} from 'redux-saga/effects';
import {getJson} from '../common/utils';
import {findInstantIndex} from './utils';
import {ActionTypes} from "./actionTypes";
import {ActionTypes as CommonActionTypes} from "../common/actionTypes";
import {ActionTypes as StepperActionTypes} from "../stepper/actionTypes";
import {getPlayerState} from "./selectors";
import {AppStore, AppStoreReplay} from "../store";
import {PlayerInstant} from "./index";
import {Bundle} from "../linker";
import {StepperContext} from "../stepper/api";
import {App} from "../index";
import {createDraft, finishDraft} from "immer";
import {ReplayApi} from "./replay";
import {quickAlgoLibraries} from "../task/libs/quickalgo_librairies";
import {taskInputEntered} from "../task";

export default function(bundle: Bundle) {
    bundle.addSaga(playerSaga);
};

export interface ReplayContext {
    state: AppStoreReplay,
    events: any[],
    instants: PlayerInstant[],
    instant: PlayerInstant,
    applyEvent: any,
    addSaga: Function,
    reportProgress: any,
    stepperDone: any,
    stepperContext: StepperContext
}

function* playerSaga(action) {
    yield takeLatest(ActionTypes.PlayerPrepare, playerPrepare, action);

    /* Use redux-saga takeLatest to cancel any executing replay saga. */
    const anyReplayAction = [
        ActionTypes.PlayerStart,
        ActionTypes.PlayerPause,
        ActionTypes.PlayerSeek
    ];

    yield takeLatest(anyReplayAction, replaySaga, action);
}

function* playerPrepare(app: App, action) {
    const {replayApi} = app;

    /*
      baseDataUrl is forwarded to playerReady (stored in its reducer) in order
        to serve as the base URL for subtitle files (in the player & editor).
      audioUrl, eventsUrl need to be able to be passed independently by the
        recorder, where they are "blob:" URLs.
    */
    const {baseDataUrl, audioUrl} = action.payload;

    // Check that the player is idle.
    const state: AppStore = yield select();
    const player = getPlayerState(state);
    if (player.isPlaying) {
        return;
    }

    // Emit a Preparing action.
    yield put({type: ActionTypes.PlayerPreparing});

    /* Load the audio. */
    const audio = player.audio;
    audio.src = audioUrl;
    audio.load();

    /* Load the events. */
    let data;
    if (action.payload.data) {
        data = action.payload.data;
    } else {
        data = yield call(getJson, action.payload.eventsUrl);
    }
    data = Object.freeze(data);

    if (Array.isArray(data)) {
        yield put({
            type: ActionTypes.PlayerPrepareFailure,
            payload: {message: "recording is incompatible with this player"}
        });

        return;
    }
    /* Compute the future state after every event. */
    const chan = yield call(requestAnimationFrames, 50);

    let platform = 'unix';
    if (data.options) {
        platform = data.options.platform;
    }

    yield put({
        type: CommonActionTypes.PlatformChanged,
        payload: platform
    });

    const context = quickAlgoLibraries.getContext();
    context.display = false;

    const replayState = {
        options: {
            platform
        },
    };

    if (data.options) {
        replayState.options = data.options;
    }

    const replayContext: ReplayContext = {
        state: replayState as AppStore,
        events: data.events,
        instants: [],
        instant: null,
        stepperContext: null,
        stepperDone: null,
        applyEvent: replayApi.applyEvent,
        addSaga,
        reportProgress,
    };

    try {
        yield call(computeInstants, replayApi, replayContext);

        context.display = true;

        /* The duration of the recording is the timestamp of the last event. */
        const instants = replayContext.instants;
        const duration = instants[instants.length - 1].t;
        yield put({type: ActionTypes.PlayerReady, payload: {baseDataUrl, duration, data, instants}});

        yield call(resetToAudioTime, app, 0);
    } catch (ex) {
        console.log(ex);

        yield put({
            type: ActionTypes.PlayerPrepareFailure,
            payload: {message: `${ex.toString()}`, context: replayContext}
        });

        return null;
    } finally {
        chan.close();
    }

    function addSaga(saga) {
        let {sagas} = replayContext.instant;
        if (!sagas) {
            sagas = replayContext.instant.sagas = [];
        }

        sagas.push(saga);
    }

    function* reportProgress(progress) {
        yield put({type: ActionTypes.PlayerPrepareProgress, payload: {progress}});

        /* Allow the display to refresh. */
        yield take(chan);
    }
}

function* computeInstants(replayApi: ReplayApi, replayContext: ReplayContext) {
    /* CONSIDER: create a redux store, use the replayApi to convert each event
       to an action that is dispatched to the store (which must have an
       appropriate reducer) plus an optional saga to be called during playback. */
    let pos, progress, lastProgress = 0, range;
    let waitingPromises = [];
    const events = replayContext.events;
    const duration = events[events.length - 1][0];
    for (pos = 0; pos < events.length; pos += 1) {
        const event = events[pos];

        /**
         * For version < 6, the translate.success action, now renamed to compile.success used to contain :
         * {
         *   ast,
         *   diagnostics
         * }
         *
         * Now it should contain :
         * {
         *   response: {
         *     ast,
         *     diagnotics,
         *     platform: 'unix'
         *   }
         * }
         */
        if (event[1] === 'translate.success') {
            event[2] = {
                response: {
                    ...event[2],
                    platform: 'unix'
                }
            };
        }

        const t = event[0];

        /**
         * Get the action name.
         * Note : translate.* actions have been replaced by compile.* actions from version 6.
         */
        const key = event[1].replace('translate.', 'compile.');

        const instant: PlayerInstant = {t, pos, event} as PlayerInstant;
        replayContext.instant = instant;


        console.log('-------- REPLAY ---- EVENT ----', key, event);

        if (key === 'stepper.step' || key === 'stepper.progress' || key === 'stepper.idle' || key === 'stepper.restart') {
            /**
             * Those event are trickier than the other ones because they copy a piece of state (state.stepper.currentStepperStep)
             * and then reuse it in future events. We cannot copy a piece of immer draft and use it later.
             * The choice made is to update the state in a more granular way in those events, so that the copied piece
             * is a piece of the real state and not one of a immer draft.
             * I would have been better to not copy the stepper at all but it seems like this would imply a huge
             * refactor of the player.
             */


            yield call(replayApi.applyEvent, key, replayContext, event);
        } else {
            const originalState = replayContext.state;
            const draft = createDraft(originalState);

            // @ts-ignore
            replayContext.state = draft;

            yield call(replayApi.applyEvent, key, replayContext, event);

            const nonHandledWaitingPromises = waitingPromises.filter(promiseElement => !promiseElement.handled);
            if (key === 'task/taskInputNeeded' && !event[2]) {
                // if (nonHandledWaitingPromises.length) {
                //     const nonHandledWaitingPromise = nonHandledWaitingPromises[0];
                //     nonHandledWaitingPromise.handled = true;
                console.log('TASK INPUT LAST INPUT', replayContext.state.printerTerminal.lastInput);
                    yield put(taskInputEntered(replayContext.state.printerTerminal.lastInput));
                    // yield nonHandledWaitingPromise;
                // }
            }

            replayContext.state.task.state = quickAlgoLibraries.getContext() && quickAlgoLibraries.getContext().getCurrentState ? {...quickAlgoLibraries.getContext().getCurrentState()} : {};
            console.log('GET STATE', Object.freeze(replayContext.state.task.state));

            // @ts-ignore
            replayContext.state = finishDraft(draft);
        }

        /* Preserve the last explicitly set range. */
        // TODO: Is this used ?
        if ('range' in instant) {
            range = instant.range;
        } else {
            instant.range = range;
        }

        instant.state = replayContext.state;

        Object.freeze(instant);
        console.log('new instant', instant.range);

        replayContext.instants.push(instant);
        progress = Math.round(pos * 50 / events.length + t * 50 / duration) / 100;
        if (progress !== lastProgress) {
            lastProgress = progress;

            yield call(replayContext.reportProgress, progress);
        }
    }
}

function* replaySaga(app: App, {type, payload}) {
    const state: AppStore = yield select();
    const player = getPlayerState(state);
    const isPlaying = player.isPlaying;
    const audio = player.audio;
    const instants = player.instants;
    let audioTime = player.audioTime;
    let instant = player.current;

    console.log('ici replay saga', type);

    if (type === ActionTypes.PlayerStart && !player.isReady) {
        /* Prevent starting playback until ready.  Should perhaps wait until
           preparation is done, for autoplay. */
        return;
    }
    if (type === ActionTypes.PlayerStart) {
        /* If at end of stream, restart automatically. */
        if (instant.isEnd) {
            audioTime = 0;
            audio.currentTime = 0;
        }
        /* The player was started (or resumed), reset to the current instant to
           clear any possible changes to the state prior to entering the update
           loop. */
        yield call(resetToAudioTime, app, audioTime);

        /* Disable the stepper during playback, its states are pre-computed. */
        yield put({type: StepperActionTypes.StepperDisabled});

        /* Play the audio now that an accurate state is displayed. */
        audio.play();

        yield put({type: ActionTypes.PlayerStarted});
    }

    if (type === ActionTypes.PlayerPause) {
        /* The player is being paused.  The audio is paused first, then the
           audio time is used to reset the state accurately. */
        audio.pause();

        const audioTime = Math.round(audio.currentTime * 1000);

        yield call(resetToAudioTime, app, audioTime);
        yield call(restartStepper);
        yield put({type: ActionTypes.PlayerPaused});

        return;
    }

    if (type === ActionTypes.PlayerSeek) {
        let start = window.performance.now();

        if (!isPlaying) {
            /* The stepper is disabled before a seek-while-paused, as it could be
               waiting on I/O. */
            yield put({type: StepperActionTypes.StepperDisabled});
        }
        /* Refreshing the display first then make the jump in the audio should
           make a cleaner jump, as audio will not start playing at the new
           position until the new state has been rendered. */
        const audioTime = Math.max(0, Math.min(player.duration, payload.audioTime));
        yield call(resetToAudioTime, app, audioTime);
        if (!isPlaying) {
            /* The stepper is restarted after a seek-while-paused, in case it is
               waiting on I/O. */
            yield call(restartStepper);
        }

        audio.currentTime = audioTime / 1000;
        if (!isPlaying) {
            return;
        }

        /* fall-through for seek-during-playback, which is handled by the
           periodic update loop */
    }

    /* The periodic update loop runs until cancelled by another replay action. */
    const chan = yield call(requestAnimationFrames, 50);
    try {
        while (!(yield select((state: AppStore) => state.player.current.isEnd))) {
            /* Use the audio time as reference. */
            let endTime = Math.round(audio.currentTime * 1000);
            if (audio.ended) {
                /* Extend a short audio to the timestamp of the last event. */
                endTime = instants[instants.length - 1].t;
            }

            if (endTime < audioTime || audioTime + 2000 < endTime) {
                /* Audio time has jumped. */
                yield call(resetToAudioTime, app, endTime);
            } else {
                /* Continuous playback. */
                yield call(replayToAudioTime, app, instants, audioTime, endTime);
            }

            audioTime = endTime;

            yield take(chan);
        }
    } finally {
        chan.close();
    }

    /* Pause when the end event is reached. */
    yield put({type: ActionTypes.PlayerPause});
}

function* replayToAudioTime(app: App, instants: PlayerInstant[], startTime: number, endTime: number) {
    let instantIndex = findInstantIndex(instants, startTime);
    const nextInstantIndex = findInstantIndex(instants, endTime);
    if (instantIndex === nextInstantIndex) {
        /* Fast path: audio time has advanced but we are still at the same
           instant, just emit a tick event to update the audio time. */
        yield put({type: ActionTypes.PlayerTick, payload: {audioTime: endTime}});

        return;
    }

    /* Update the DOM by replaying incremental events between (immediately
       after) `instant` and up to (including) `nextInstant`. */
    instantIndex += 1;
    while (instantIndex <= nextInstantIndex) {
        let instant = instants[instantIndex];
        if (instant.hasOwnProperty('mute')) {
            yield put({type: ActionTypes.PlayerEditorMutedChanged, payload: {isMuted: instant.mute}});
        }
        if (instant.hasOwnProperty('jump')) {
            // @ts-ignore
            yield call(jumpToAudioTime, app, instant.jump);

            return;
        }

        if (instant.sagas) {
            /* Keep in mind that the instant's saga runs *prior* to the call
               to resetToAudioTime below, and should not rely on the global
               state being accurate.  Instead, it should use `instant.state`. */
            for (let saga of instant.sagas) {
                yield call(saga, instant);
            }
        }
        if (instant.isEnd) {
            /* Stop a long audio at the timestamp of the last event. */
            endTime = instant.t;
            break;
        }

        instantIndex += 1;
    }

    /* Perform a quick reset to update the editor models without pushing
       the new state to the editors instances (they are assumed to have
       been synchronized by replaying individual events).
    */
    yield call(resetToAudioTime, app, endTime, true);
}

/* A quick reset avoids disabling and re-enabling the stepper (which restarts
   the stepper task). */
function* resetToAudioTime(app: App, audioTime: number, quick?: boolean) {
    const {replayApi} = app;

    /* Call playerTick to store the current audio time and to install the
       current instant's state as state.player.current */
    yield put({type: ActionTypes.PlayerTick, payload: {audioTime}});

    /* Call the registered reset-sagas to update any part of the state not
       handled by playerTick. */
    const state: AppStore = yield select();
    const instant = state.player.current;

    yield call(replayApi.reset, instant, quick);
}

function* restartStepper() {
    /* Re-enable the stepper to allow the user to interact with it. */
    yield put({type: StepperActionTypes.StepperEnabled});
}

function* jumpToAudioTime(app: App, audioTime: number) {
    /* Jump and full reset to the specified audioTime. */
    const state: AppStore = yield select();
    const player = getPlayerState(state);
    audioTime = Math.max(0, Math.min(player.duration, audioTime));
    const audio = player.audio;
    audio.currentTime = audioTime / 1000;

    yield call(resetToAudioTime, app, audioTime);
}

function requestAnimationFrames(maxDelta) {
    let shutdown = false;
    let lastTimestamp = 0;
    return eventChannel(function(emitter) {
        function onAnimationFrame(timestamp) {
            if (timestamp >= lastTimestamp + maxDelta) {
                lastTimestamp = timestamp;
                emitter(timestamp);
            }
            if (!shutdown) {
                window.requestAnimationFrame(onAnimationFrame);
            }
        }

        window.requestAnimationFrame(onAnimationFrame);
        return function() {
            shutdown = true;
        };
    }, buffers.sliding(1));
}
