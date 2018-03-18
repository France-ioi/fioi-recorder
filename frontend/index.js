
import 'es5-shim';
import 'es6-shim';
import 'array.prototype.fill'; // Array.prototype.fill
import 'es6-symbol/implement'; // Symbol.iterator

import React from 'react';
import ReactDOM from 'react-dom';
import {Provider} from 'react-redux';
import {applyMiddleware} from 'redux';
import createSagaMiddleware from 'redux-saga';
import Immutable from 'immutable';
import queryString from 'query-string';
import 'font-awesome/css/font-awesome.min.css?global';
import 'rc-slider/dist/rc-slider.css?global';

import style from './style.scss';

// import sagaMonitor from './sagaMonitor';
import link from './linker';
import stepperBundle from './stepper/index';
import {default as commonBundle, interpretQueryString} from './common/index';

import SandboxBundle from './sandbox/index';
import RecorderBundle from './recorder/index';
import PlayerBundle from './player/index';
import EditorBundle from './editor/index';
import LangBundle from './lang/index';

const {store, scope, finalize, start} = link(function (bundle, deps) {

  bundle.defineAction('init', 'System.Init');
  bundle.addReducer('init', (_state, {payload: {baseUrl, authProviders}}) =>
    Immutable.Map({baseUrl, authProviders, scope}));

  bundle.include(commonBundle);
  bundle.include(stepperBundle);
  bundle.include(SandboxBundle);
  bundle.include(RecorderBundle);
  bundle.include(PlayerBundle);
  bundle.include(EditorBundle);
  bundle.include(LangBundle);

  if (process.env.NODE_ENV === 'development') {
    bundle.addEarlyReducer(function (state, action) {
      console.log('action', action);
      return state;
    });
  }

  // bundle.addEnhancer(DevTools.instrument());

}/*, {reduxSaga: {sagaMonitor}}*/);
finalize(scope);

/* In-browser API */
const Codecast = window.Codecast = {store, scope};

Codecast.start = function (options) {

  const {language} = window.localStorage;

  store.dispatch({type: scope.init, payload: options});
  store.dispatch({type: scope.setLanguage, language: language || navigator.language});

  // store.dispatch({type: scope.modeChanged, mode: 'arduino'});

  const qs = queryString.parse(window.location.search);


  const stepperOptions = {
    showStepper: true,
    showStack: true,
    showViews: true,
    showIO: true,
    // arduino: true,
  };
  (qs.stepperControls||'').split(',').forEach(function (controlStr) {
    // No prefix to highlight, '-' to disable.
    const m = /^([-_])?(.*)$/.exec(controlStr);
    if (m) {
      stepperOptions[m[2]] = m[1] || '+';
    }
  });
  if ('noStepper' in qs) {
    stepperOptions.showStepper = false;
    stepperOptions.showStack = false;
    stepperOptions.showViews = false;
    stepperOptions.showIO = false;
  }
  if ('noStack' in qs) {
    stepperOptions.showStack = false;
  }
  if ('noViews' in qs) {
    stepperOptions.showViews = false;
  }
  if ('noIO' in qs) {
    stepperOptions.showIO = false;
  }
  store.dispatch({type: scope.stepperConfigure, options: stepperOptions});

  if ('editorLanguage' in qs)
  {
    store.dispatch({type: scope.bufferLanguageConfigure, options: qs.editorLanguage||''});
  }

  /* Source code from options or URL */
  if ('source' in options) {
    store.dispatch({type: scope.bufferLoad, buffer: 'source', text: options.source||''});
  } else if ('source' in qs) {
    store.dispatch({type: scope.bufferLoad, buffer: 'source', text: qs.source||''});
  }

  /* Standard input from options or URL */
  if ('input' in options) {
    store.dispatch({type: scope.inputLoad, buffer: 'input', text: options.input||''});
  } else if ('input' in qs) {
    store.dispatch({type: scope.inputLoad, buffer: 'input', text: qs.input||''});
  }

  /* Run the sagas (must be done before loginFeedback) */
  start();

  /* Start already logged in. */
  if ('user' in options) {
    store.dispatch({type: scope.loginFeedback, payload: {user: options.user}});
  }

  /* Set token from URL -- TODO: change this mechanism */
  if ('token' in qs) {
    store.dispatch({type: scope.uploadTokenChanged, token: qs.token});
  }

  let App = scope.SandboxApp;

  /* recorder and player */
  store.dispatch({type: scope.playerClear});

  if (options.start === 'recorder') {
    store.dispatch({type: scope.recorderPrepare});
    App = scope.RecorderApp;
  }

  if (options.start === 'player') {
    store.dispatch({
      type: scope.playerPrepare,
      baseDataUrl: options.baseDataUrl,
      audioUrl: `${options.baseDataUrl}.mp3`,
      eventsUrl: `${options.baseDataUrl}.json`,
    });
    App = scope.PlayerApp;
  }

  if (options.start === 'editor') {
    store.dispatch({
      type: scope.editorPrepare,
      payload: {
        baseDataUrl: options.baseDataUrl
      }
    });
    App = scope.EditorApp;
  }

  const container = document.getElementById('react-container');
  ReactDOM.render(<Provider store={store}><App/></Provider>, container);

};
