import {createSlice, PayloadAction} from '@reduxjs/toolkit';

export interface DocumentationConcept {
    id: string,
    name: string,
    url?: string,
    isBase?: boolean,
    order?: number,
    python?: boolean,
}

export enum DocumentationLanguage {
    Python = 'python',
    Blockly = 'blockly',
    Scratch = 'scratch',
}

export interface DocumentationState {
    concepts?: DocumentationConcept[],
    selectedConceptId?: string,
    language: DocumentationLanguage,
}

export const documentationInitialState = {
    concepts: [],
    selectedConceptId: null,
    language: DocumentationLanguage.Python,
} as DocumentationState;

export const documentationSlice = createSlice({
    name: 'documentation',
    initialState: documentationInitialState,
    reducers: {
        documentationConceptsLoaded(state, action: PayloadAction<DocumentationConcept[]>) {
            state.concepts = action.payload;
        },
        documentationConceptSelected(state, action: PayloadAction<string>) {
            state.selectedConceptId = action.payload;
        },
        documentationLanguageChanged(state, action: PayloadAction<DocumentationLanguage>) {
            state.language = action.payload;
        },
    },
});

export const {
    documentationConceptsLoaded,
    documentationConceptSelected,
    documentationLanguageChanged,
} = documentationSlice.actions;

export default documentationSlice;
