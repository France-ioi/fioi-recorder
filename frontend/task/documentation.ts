import {Bundle} from "../linker";
import {call, put, select, takeEvery} from "redux-saga/effects";
import {quickAlgoLibraries} from "./libs/quickalgo_librairies";
import {extractLevelSpecific} from "./utils";
import {
    DocumentationConcept,
    documentationConceptSelected,
    documentationConceptsLoaded,
    documentationLanguageChanged
} from "./documentation_slice";
import {taskLevels} from "./task_slice";
import {AppAction} from "../store";
import {ActionTypes} from "../stepper/actionTypes";
import {ActionTypes as CommonActionTypes} from "../common/actionTypes";

let openerChannel;

export enum DocumentationActionTypes {
    DocumentationLoad = 'documentation/load',
}

export interface DocumentationLoadAction extends AppAction {
    type: DocumentationActionTypes.DocumentationLoad,
    payload: {
        standalone: boolean,
    },
}

export interface ConceptViewer {
    loadConcepts: Function,
}

export const documentationLoad = (standalone: boolean): DocumentationLoadAction => ({
    type: DocumentationActionTypes.DocumentationLoad,
    payload: {
        standalone,
    },
});

function getConceptsFromChannel() {
    return new Promise((resolve, reject) => {
        if (!openerChannel) {
            openerChannel = window.Channel.build({window: window.opener, origin: '*', scope: 'test'});
        }

        openerChannel.call({
            method: 'getConceptViewerConfigs',
            timeout: 100,
            success: function (configs) {
                resolve(configs);
            },
            error: function (err) {
                reject(err);
            }
        });
    })
}

export function sendCodeExampleToOpener(code, language) {
    if (!openerChannel) {
        openerChannel = window.Channel.build({window: window.opener, origin: '*', scope: 'test'});
    }

    openerChannel.call({
        method: 'useCodeExample',
        params: {
            code,
            language,
        },
        success: function () {
        },
        error: function () {
        }
    });
}

function* documentationLoadSaga(standalone: boolean) {
    if (standalone) {
        try {
            const {concepts, selectedConceptId, screen, language} = yield call(getConceptsFromChannel);
            const currentScreen = yield select(state => state.screen);
            if (currentScreen !== screen) {
                yield put({type: CommonActionTypes.AppSwitchToScreen, payload: {screen}});
            }
            yield put(documentationLanguageChanged(language));
            yield call(loadDocumentationConcepts, concepts, selectedConceptId);
        } catch (e) {
            yield put({type: ActionTypes.CompileFailed, response: {diagnostics: e.message}});
        }
        return;
    }

    let context = quickAlgoLibraries.getContext();
    if (context.display && context.infos.conceptViewer) {
        const conceptViewer = context.infos.conceptViewer;
        let allConcepts = context.getConceptList();
        allConcepts = allConcepts.concat(window.getConceptViewerBaseConcepts());

        const currentLevel = yield select(state => state.task.currentLevel);
        const getMessage = yield select(state => state.getMessage);
        const curIncludeBlocks = extractLevelSpecific(context.infos.includeBlocks, taskLevels[currentLevel]);

        let concepts = window.getConceptsFromBlocks(curIncludeBlocks, allConcepts, context);
        if (conceptViewer.length) {
            concepts = concepts.concat(conceptViewer);
        } else {
            concepts.push('base');
        }

        const taskConcept = {
            id: 'task-instructions',
            name: getMessage('TASK_DOCUMENTATION_INSTRUCTIONS').s,
        };

        const documentationConcepts: DocumentationConcept[] = window.conceptsFill(concepts, allConcepts);
        const documentationConceptsWithTask: DocumentationConcept[] = [
            taskConcept,
            ...documentationConcepts,
        ];

        yield call(loadDocumentationConcepts, documentationConceptsWithTask);
    }
}

function* loadDocumentationConcepts(documentationConcepts, selectedConceptId = null) {
    yield put(documentationConceptsLoaded(documentationConcepts));

    if (selectedConceptId) {
        yield put(documentationConceptSelected(selectedConceptId));
    } else {
        const selectedConceptId = yield select(state => state.documentation.selectedConceptId);
        if (documentationConcepts.length && (!selectedConceptId || !documentationConcepts.find(concept => selectedConceptId === concept.id))) {
            yield put(documentationConceptSelected(documentationConcepts[0].id));
        }
    }
}

export default function (bundle: Bundle) {
    bundle.addSaga(function* () {
        yield takeEvery(DocumentationActionTypes.DocumentationLoad, function* (action: DocumentationLoadAction) {
            yield call(documentationLoadSaga, action.payload.standalone);
        });
    });
}
