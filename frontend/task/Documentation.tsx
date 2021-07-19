import React, {useEffect, useState} from 'react';
import {Icon} from "@blueprintjs/core";
import {useDispatch} from "react-redux";
import {ActionTypes as CommonActionTypes} from "../common/actionTypes";
import {documentationLoad, sendCodeExampleToOpener} from "./documentation";
import {useAppSelector} from "../hooks";
import {documentationConceptSelected, DocumentationLanguage, documentationLanguageChanged} from "./documentation_slice";
import {Screen} from "../common/screens";
import {select} from "redux-saga/effects";
import {FontAwesomeIcon} from '@fortawesome/react-fontawesome';
import {faExternalLinkAlt} from "@fortawesome/free-solid-svg-icons";
import {ActionTypes} from "../buffers/actionTypes";
import {documentModelFromString} from "../buffers";

interface DocumentationProps {
    standalone: boolean,
}

export function Documentation(props: DocumentationProps) {
    const dispatch = useDispatch();

    const concepts = useAppSelector(state => state.documentation.concepts);
    const selectedConceptId = useAppSelector(state => state.documentation.selectedConceptId);
    const selectedConcept = selectedConceptId ? concepts.find(concept => selectedConceptId === concept.id) : null;
    const documentationLanguage = useAppSelector(state => state.documentation.language);
    const screen = useAppSelector(state => state.screen);
    const getMessage = useAppSelector(state => state.getMessage);
    const firstConcepts = concepts.slice(0, 3);

    const [iframeRef, setIframeRef] = useState(null);

    let conceptUrl = null;
    if (selectedConcept && selectedConcept.url) {
        const urlSplit = selectedConcept.url.split('#');
        if (urlSplit[1]) {
            urlSplit[urlSplit.length - 1] = documentationLanguage + '-' + urlSplit[urlSplit.length - 1];
        } else {
            urlSplit[1] = documentationLanguage;
        }
        conceptUrl = urlSplit.join('#');
    }

    useEffect(() => {
        dispatch(documentationLoad(props.standalone));
    }, []);

    const iframeLoaded = () => {
        const docWindow = iframeRef.contentWindow;
        const channel = window.Channel.build({window: docWindow, origin: '*', scope: 'snippet'});

        channel.notify({
            method: 'setupConceptDisplaySnippets',
            timeout: 50,
        });

        channel.bind('useCodeExample', (instance, {code, language}) => {
            if (code) {
                if (props.standalone) {
                    sendCodeExampleToOpener(code, language);
                } else {
                    useCodeExample(code, language);
                }
            }
        });
    };

    const openDocumentationInNewWindow = () => {
        const searchParams = new URLSearchParams(document.location.search);
        searchParams.set('documentation', '1');
        const documentationUrl = window.location.protocol + "//" + window.location.host + window.location.pathname + '?' + searchParams.toString();

        const fullscreenWindow = window.open(documentationUrl);
        const channel = window.Channel.build({window: fullscreenWindow, origin: '*', scope: 'test'});

        channel.bind('getConceptViewerConfigs', () => {
            return {
                concepts,
                selectedConceptId,
                language: documentationLanguage,
                screen,
            };
        });

        channel.bind('useCodeExample', (instance, {code, language}) => {
            useCodeExample(code, language);
        });
    };

    const useCodeExample = (code, language) => {
        if (!code) {
            return;
        }

        dispatch({
            type: ActionTypes.BufferReset,
            buffer: 'source',
            model: documentModelFromString(code),
        });
        dispatch({
            type: CommonActionTypes.PlatformChanged,
            payload: language,
        });
        closeDocumentation();
    };

    const openDocumentationBig = () => {
        dispatch({
            type: CommonActionTypes.AppSwitchToScreen,
            payload: {screen: Screen.DocumentationBig},
        });
    };

    const closeDocumentation = () => {
        dispatch({
            type: CommonActionTypes.AppSwitchToScreen,
            payload: {screen: null},
        });
    };

    const selectConcept = (concept) => {
        dispatch(documentationConceptSelected(concept.id));
    };

    const chooseConceptFromDropdown = (event) => {
        const selectedConceptId = event.target.value;
        const selectedConcept = concepts.find(concept => selectedConceptId === concept.id);
        selectConcept(selectedConcept);
    }

    const setDocumentationLanguage = (event) => {
        const language = event.target.value;
        dispatch(documentationLanguageChanged(language));
    };

    return (
        <div className={`documentation ${Screen.DocumentationBig === screen ? 'is-big' : 'is-small'} ${props.standalone ? 'is-standalone' : ''}`}>
            <div className="documentation-header">
                <div className="documentation-header-icon">
                    <Icon icon="zoom-in"/>
                </div>
                <h2>{getMessage('TASK_DOCUMENTATION')}</h2>
                <div className="documentation-language-selector">
                    <label className='bp3-label documentation-select'>
                        <div className='bp3-select'>
                            <select onChange={setDocumentationLanguage} value={documentationLanguage}>
                                <option value={DocumentationLanguage.Python}>Python</option>
                                <option value={DocumentationLanguage.Blockly}>Blockly</option>
                                <option value={DocumentationLanguage.Scratch}>Scratch</option>
                            </select>
                        </div>
                    </label>
                </div>
                {!props.standalone && <div className="documentation-new-window">
                    <a onClick={openDocumentationInNewWindow}>
                        <FontAwesomeIcon icon={faExternalLinkAlt}/>
                    </a>
                </div>}
                {(!props.standalone || Screen.DocumentationBig === screen) && <div className="documentation-close-container">
                    <div className="documentation-close" onClick={closeDocumentation}>
                    </div>
                </div>}
            </div>
            <div className="documentation-language-dropdown">
                <div className="documentation-tabs-menu">
                    <Icon icon="code"/>
                </div>
                <div className="documentation-category-selector">
                    <label className='bp3-label documentation-select'>
                        <div className='bp3-select'>
                            <select onChange={setDocumentationLanguage} value={documentationLanguage}>
                                <option value={DocumentationLanguage.Python}>Python</option>
                                <option value={DocumentationLanguage.Blockly}>Blockly</option>
                                <option value={DocumentationLanguage.Scratch}>Scratch</option>
                            </select>
                        </div>
                    </label>
                </div>
            </div>
            <div className="documentation-category-dropdown">
                <div className="documentation-tabs-menu">
                    <a onClick={openDocumentationBig} className="hidden-mobile">
                        <Icon icon="properties"/>
                    </a>
                    <span className="visible-mobile">
                        <Icon icon="properties"/>
                    </span>
                </div>
                <div className="documentation-category-selector">
                    <label className='bp3-label documentation-select'>
                        <div className='bp3-select'>
                            <select onChange={chooseConceptFromDropdown} value={selectedConcept ? selectedConcept.id : undefined}>
                                {firstConcepts.map(concept =>
                                    <option value={concept.id} key={concept.id}>{concept.name}</option>
                                )}
                            </select>
                        </div>
                    </label>
                </div>
            </div>
            <div className="documentation-tabs">
                <div className="documentation-tabs-menu">
                    <a onClick={openDocumentationBig}>
                        <Icon icon="properties"/>
                    </a>
                </div>
                {firstConcepts.map(concept =>
                    <React.Fragment key={concept.id}>
                        {selectedConceptId === concept.id ? <div className={`documentation-tab is-active`}>
                            <div className="documentation-tab-title">{concept.name}</div>
                        </div> : <a className={`documentation-tab`} onClick={() => selectConcept(concept)}>
                            <div className="documentation-tab-title">{concept.name}</div>
                        </a>}
                    </React.Fragment>
                )}
                <div className="documentation-tabs-end"/>
            </div>
            <div className="documentation-body">
                <div className="documentation-menu">
                    {concepts.map(concept =>
                        <React.Fragment key={concept.id}>
                            {selectedConceptId === concept.id ? <div className={`documentation-tab-left is-active`}>
                                <div className="documentation-tab-title">
                                    <Icon icon="dot"/>
                                    <span>{concept.name}</span>
                                </div>
                            </div> : <a className={`documentation-tab-left`} onClick={() => selectConcept(concept)}>
                                <div className="documentation-tab-title">
                                    <Icon icon="dot"/>
                                    <span>{concept.name}</span>
                                </div>
                            </a>}
                        </React.Fragment>
                    )}
                </div>
                {selectedConcept &&
                    <div className="documentation-aside">
                        <div className="documentation-category-title">
                            <div className="documentation-header-icon is-blue">
                                <Icon icon="zoom-in"/>
                            </div>
                            <h2>{selectedConcept.name}</h2>
                        </div>
                        <div className="documentation-content">
                            {'task-instructions' === selectedConcept.id ?
                                <div className="documentation-task-instructions">
                                    <p>
                                        Programmez le robot ci-contre pour qu&#39;il atteigne l&#39;étoile, en sautant
                                        de plateforme en plateforme. Mettez le robot directement sous une plateforme
                                        avant de le faire sauter pour le faire monter sur cette plateforme.
                                    </p>
                                    <p>
                                        Votre programme sera testé sur 2 plateaux différents, et doit fonctionner sur les deux.
                                    </p>
                                    <p>
                                        Chaque plateforme commence toujours à droite de celle en dessous d&#39;elle.
                                    </p>
                                </div>
                                :
                                <iframe
                                    className="documentation-viewer-content"
                                    name="viewerContent"
                                    src={conceptUrl}
                                    onLoad={iframeLoaded}
                                    ref={setIframeRef}
                                />
                            }
                        </div>
                    </div>
                }
            </div>
        </div>
    );
}
