import React from "react";
import {InputOutputVisualization} from "./InputOutputVisualization";
import {QuickAlgoLibrary} from "../quickalgo_librairies";
import {call, fork, put, race, select, take, takeEvery} from "redux-saga/effects";
import {AppStore} from "../../../store";
import {channel} from "redux-saga";
import {ActionTypes} from "../../../buffers/actionTypes";
import {ActionTypes as StepperActionTypes} from "../../../stepper/actionTypes";
import {TaskActionTypes as TaskActionTypes, taskInputEntered, taskReset, TaskResetAction} from "../../index";
import {documentModelFromString} from "../../../buffers";
import taskSlice, {taskInputNeeded, taskSuccess, taskSuccessClear, updateCurrentTest} from "../../task_slice";
import printerTerminalSlice, {
    printerTerminalInitialState,
    printerTerminalRecordableActions,
    terminalFocus,
    terminalInit,
    terminalInputEnter,
    terminalPrintLine, terminalReset
} from "./printer_terminal_slice";
import {App} from "../../../index";
import {PlayerInstant} from "../../../player";
import {addAutoRecordingBehaviour} from "../../../recorder/record";
import {IoMode} from "../../../stepper/io";
import {ReplayContext} from "../../../player/sagas";
import {TermBuffer, writeString} from "../../../stepper/io/terminal";

function escapeHtml(unsafe) {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

enum PrinterLibAction {
    readLine = 'readLine',
    getInput = 'getInput',
    printLine = 'printLine',
    reset = 'reset',
}

enum PrinterLineEventType {
    input = 'input',
    output = 'output',
}

enum PrinterLineEventSource {
    initial = 'initial',
    runtime = 'runtime',
}

interface PrinterLineEvent {
    type: PrinterLineEventType,
    content: string,
    source?: PrinterLineEventSource,
}

const inputBufferLib = 'printerLibInput';
const outputBufferLib = 'printerLibOutput';
export const inputBufferLibTest = 'printerLibTestInput';
export const outputBufferLibTest = 'printerLibTestOutput';

interface ExecutionChannelMessage {
    action: PrinterLibAction,
    payload?: any,
    resolve?: Function,
    reject?: Function,
}

const executionChannel = channel<ExecutionChannelMessage>();

const localLanguageStrings = {
    fr: {
        label: {
            print: "écrire",
            print_end: "écrire %1 en terminant par %2",
            read: "lire une ligne",
            readInteger: "lire un entier sur une ligne",
            readFloat: "lire un nombre à virgule sur une ligne",
            eof: "fin de la saisie"
        },
        code: {
            print: "print",
            print_end: "print_end",
            read: "input",
            readInteger: "lireEntier",
            readFloat: "lireDecimal",
            eof: "finSaisie"
        },
        description: {
            print: "print(texte) affiche le texte sur le terminal",
            read: "input() retourne une chaîne : la prochaine ligne de l'entrée"
        },
        startingBlockName: "Programme",
        messages: {
            inputPrompt: "Veuillez écrire une entrée pour le programme.",
            inputEmpty: "Votre programme a essayé de lire l'entrée alors qu'il n'y avait plus aucune ligne à lire !",
            outputWrong: "Votre programme n'a pas traité correctement toutes les lignes.",
            outputCorrect: "Bravo ! Votre programme a traité correctement toutes les lignes.",
            tooFewChars: "La ligne {0} de la sortie de votre programme est plus courte qu'attendue.",
            tooManyChars: "La ligne {0} de la sortie de votre programme est plus longue qu'attendue.",
            tooFewLines: "Trop peu de lignes en sortie",
            tooManyLines: "Trop de lignes en sortie",
            correctOutput: "La sortie est correcte !",
            moreThan100Moves: "La sortie est correcte, mais vous l'avez produite en plus de 100 étapes…"
        },
        errorStr: {
            intro: "La sortie de votre programme est fausse, à la ligne ",
            expected: " :<br>Attendu: \"<b>",
            answer: "</b>\",<br>Votre réponse: \"<b>",
            introChar: "</b>\".<br>(Premier caractère erroné à la colonne ",
            expectedChar: "; attendu: \"<b>",
            answerChar: "</b>\", votre réponse: \"<b>"
        }
    },
    de: {
        label: {
            print: "schreibe",
            print_end: "schreibe",
            read: "lies Zeile",
            readInteger: "lies Zeile als ganze Zahl",
            readFloat: "lies Zeile als Komma-Zahl",
            eof: "Ende der Eingabe",
            charToNumber: "Zeichen zu Zahl",
            numberToChar: "Zahl zu Zeichen",
            charToAscii: "ASCII-Zahl zu Zeichen",
            asciiToChar: "Zeichen zu ASCII-Zahl",
        },
        code: {
            print: "schreibe",
            print_end: "schreibe",
            read: "lies",
            readInteger: "liesGanzzahl",
            readFloat: "liesKommazahl",
            eof: "eingabeEnde",
            charToNumber: "zeichenZuZahl",
            numberToChar: "zahlZuZeichen",
            asciiToChar: "zeichenZuAscii",
            charToAscii: "asciiZuZeichen",
        },
        description: {
        },
        startingBlockName: "Programm",
        messages: {
            inputPrompt: "Please input a line for the program.", // TODO :: translate two lines
            inputEmpty: "Your program tried to read the input while there is no line left to read!",
            outputWrong: "Das Programm hat nicht alle Zeilen richtig ausgegeben.",
            outputCorrect: "Bravo! Das Programm hat alle Zeilen richtig ausgegeben.",
            tooFewChars: "Zeile zu kurz: Zeile {0}",
            tooManyChars: "Zeile zu lang: Zeile {0}",
            tooFewLines: "Zu wenig Zeilen ausgegeben",
            tooManyLines: "Zu viele Zeilen ausgegeben",
            correctOutput: "Die Ausgabe ist richtig!",
            moreThan100Moves: "Die Ausgabe ist richtig, aber du hast mehr als 100 Schritte benötigt …"
        },
        errorStr: {
            intro: "Das Programm hat nicht alle Zeilen richtig ausgegeben.; in Zeile ",
            expected: ":<br>Erwartet: \"<b>",
            answer: "</b>\",<br>deine Ausgabe: \"<b>",
            introChar: "</b>\".<br>(Erstes falsches Zeichen in Spalte ",
            expectedChar: "; erwartet: \"<b>",
            answerChar: "</b>\", deine Ausgabe: \"<b>"
        }
    },
    none: {
        comment: {
        }
    }
};

export class PrinterLib extends QuickAlgoLibrary {
    success: boolean = false;
    taskInfos: any;
    cells: any;
    texts: any;
    scale: number;
    libOptions: any;
    showIfMutator: boolean;
    printer: any;
    ioMode: IoMode;

    constructor (display, infos) {
        super(display, infos);

        this.setLocalLanguageStrings(localLanguageStrings);

        const conceptBaseUrl = (window.location.protocol == 'https:' ? 'https:' : 'http:') + '//'
            + 'static4.castor-informatique.fr/help/printer_codecast.html';

        this.conceptList = [
            {
                id: 'printer_introduction',
                name: 'Les entrées/sorties',
                url: conceptBaseUrl + '#printer_introduction',
                isBase: true
            },
            {id: 'printer_print', name: 'Afficher une ligne', url: conceptBaseUrl + '#printer_print', isBase: true},
            {id: 'printer_read', name: 'Lire une ligne', url: conceptBaseUrl + '#printer_read', isBase: true}
        ];

        this.cells = [];
        this.texts = [];
        this.scale = 1;
        this.ioMode = null;
        this.libOptions = infos.libOptions ? infos.libOptions : {};

        this.printer = {
            ioEvents: [] as PrinterLineEvent[],
            terminal: null,
            commonPrint: this.commonPrint,
            print: this.print,
            print_end: this.print_end,
            commonRead: this.commonRead,
            read: this.read,
            readInteger: this.readInteger,
            readFloat: this.readFloat,
            eof: this.eof,
            charToAscii: this.charToAscii,
            asciiToChar: this.asciiToChar,
            charToNumber: this.charToNumber,
            numberToChar: this.numberToChar,
        };

        this.customBlocks = {
            printer: {
                print: [
                    // TODO : variants is not properly supported yet, once supported properly, print and print_end should be merged
                    { name: "print", params: [null], variants: [[null], [null, null]], anyArgs: true},
                    { name: "print_end", params: [null, null], variants: [[null], [null, null]], anyArgs: true, blocklyJson: {inputsInline: true}}
                ],
                read:  [
                    { name: "read", yieldsValue: true, blocklyJson: {output: "String"} },
                    { name: "readInteger", yieldsValue: true, blocklyJson: {output: "Number"} },
                    { name: "readFloat", yieldsValue: true, blocklyJson: {output: "Number"} },
                    { name: "eof", yieldsValue: true, blocklyJson: {output: "Boolean"}}
                ],
                manipulate: [
                    { name: "charToNumber", params: ["String"], yieldsValue: true, blocklyJson: {output: "Number"}},
                    { name: "numberToChar", params: ["Number"], yieldsValue: true, blocklyJson: {output: "String"}},
                    { name: "charToAscii",  params: ["String"], yieldsValue: true, blocklyJson: {output: "Number"}},
                    { name: "asciiToChar",  params: ["Number"], yieldsValue: true, blocklyJson: {output: "String"}}
                ]
            }
        };

        if (infos.showIfMutator) {
            this.showIfMutator = true;
        }
    }

    reset(taskInfos, appState: AppStore = null) {
        this.success = false;

        this.printer.ioEvents = [];

        if (taskInfos) {
            this.taskInfos = taskInfos;
        }
        if (this.taskInfos && this.taskInfos.input) {
            this.printer.ioEvents.push({type: PrinterLineEventType.input, content: this.taskInfos.input, source: PrinterLineEventSource.initial});
        }
        if (appState && appState.ioPane.mode) {
            this.ioMode = appState.ioPane.mode;
        }

        if (this.display) {
            executionChannel.put({
                action: PrinterLibAction.reset,
            });
        }
    };

    getCurrentState() {
        return {
            events: this.printer.ioEvents,
        }
    };

    reloadState(data): void {
        this.printer.ioEvents = data.events ?? [];
    };

    resetDisplay() {

    };

    commonPrint(args, end) {
        return new Promise<null>((resolve, reject) => {
            executionChannel.put({
                action: PrinterLibAction.printLine,
                payload: {args, end},
                resolve,
                reject
            });
        });
    }

    async print() {
        console.log('PRINT', arguments);
        await this.commonPrint(Array.prototype.slice.call(arguments, 0, -1), "\n");
        this.waitDelay(arguments[arguments.length-1]);
    }

    print_end() {
        return new Promise(() => {
            if(arguments.length > 1) {
                this.commonPrint(Array.prototype.slice.call(arguments, 0, -2), arguments[arguments.length-2]);
                this.waitDelay(arguments[arguments.length-1]);
            } else {
                this.commonPrint([], "\n");
                this.waitDelay(arguments[arguments.length-1]);
            }
        })
    }

    commonRead(action: PrinterLibAction = PrinterLibAction.readLine) {
        return new Promise<string>((resolve, reject) => {
            executionChannel.put({action, resolve, reject});
        });
    }

    async read(callback) {
        const str = await this.commonRead();
        this.waitDelay(callback, str);
    }

    async readInteger(callback) {
        const result = await this.commonRead();
        this.waitDelay(callback, parseInt(result));
    }

    async readFloat(callback) {
        const result = await this.commonRead();
        this.waitDelay(callback, parseFloat(result));
    }

    async eof(callback) {
        const result = await this.commonRead(PrinterLibAction.getInput);
        this.waitDelay(callback, -1 === result.indexOf('\n'));
    }

    charToAscii(char, callback) {
        const number = char.charCodeAt(0);
        this.waitDelay(callback, number);
    }

    asciiToChar(number, callback) {
        const char = String.fromCharCode(number);
        this.waitDelay(callback, char);
    }

    charToNumber(char, callback) {
        const number = char.charCodeAt(0) - 65;
        this.waitDelay(callback, number);
    }
    numberToChar(number, callback) {
        const char = String.fromCharCode(number + 65);
        this.waitDelay(callback, char);
    }

    updateScale() {
        if (!this.display) {
            return;
        }
    };

    getInputText() {
        return this.printer.ioEvents
            .filter(event => PrinterLineEventType.input === event.type && PrinterLineEventSource.initial === event.source)
            .map(event => event.content)
            .join("");
    }

    getFirstInput() {
        const inputEvents = this.printer.ioEvents
            .filter(event => PrinterLineEventType.input === event.type && PrinterLineEventSource.initial === event.source)
            .map(event => event.content);

        return inputEvents.length ? inputEvents[0] : null;
    }

    popFirstInput() {
        const firstInputIndex = this.printer.ioEvents.findIndex(event => PrinterLineEventType.input === event.type && PrinterLineEventSource.initial === event.source);
        if (-1 !== firstInputIndex) {
            this.printer.ioEvents = [
                ...this.printer.ioEvents.slice(0, firstInputIndex),
                ...this.printer.ioEvents.slice(firstInputIndex + 1),
            ];
        }
    }

    replaceFirstInput(newValue: string) {
        const firstInputIndex = this.printer.ioEvents.findIndex(event => PrinterLineEventType.input === event.type && PrinterLineEventSource.initial === event.source);
        if (-1 !== firstInputIndex) {
            this.printer.ioEvents = [
                ...this.printer.ioEvents.slice(0, firstInputIndex),
                {
                    ...this.printer.ioEvents[firstInputIndex],
                    content: newValue,
                },
                ...this.printer.ioEvents.slice(firstInputIndex + 1),
            ];
        }
    }

    getOutputText() {
        return this.printer.ioEvents
            .filter(event => PrinterLineEventType.output === event.type)
            .map(event => event.content)
            .join("");
    }

    getTerminalText() {
        return this.printer.ioEvents
            .filter(event => PrinterLineEventSource.runtime === event.source)
            .map(event => event.content)
            .join("");
    }

    checkOutputHelper() {
        const currentOutputText = this.getOutputText();
        let expectedLines = this.taskInfos.output.replace(/\s*$/,"").split("\n");
        let actualLines = currentOutputText.replace(/\s*$/,"").split("\n");

        for (let iLine = 0; iLine < expectedLines.length && iLine < actualLines.length; iLine++) {
            let expectedLine = expectedLines[iLine].replace(/\s*$/,"");
            let actualLine = actualLines[iLine].replace(/\s*$/,"");

            let iChar = 0;
            for (iChar = 0; iChar < expectedLine.length && iChar < actualLine.length; iChar++) {
                if (actualLine[iChar] != expectedLine[iChar]) {
                    this.success = false;
                    let errorstring = (
                        this.strings.errorStr.intro
                        + (iLine + 1)
                        + this.strings.errorStr.expected
                        + escapeHtml(expectedLine)
                        + this.strings.errorStr.answer
                        + escapeHtml(actualLine)
                        + this.strings.errorStr.introChar
                        + (iChar + 1)
                        + this.strings.errorStr.expectedChar
                        + escapeHtml(expectedLine[iChar])
                        + this.strings.errorStr.answerChar
                        + escapeHtml(actualLine[iChar]) + '</b>"');
                    throw(errorstring); // add line info iLine + 1, add char info iChar + 1
                }
            }

            if (actualLine.length < expectedLine.length) {
                this.success = false;
                throw(this.strings.messages.tooFewChars.format(iLine + 1)); // add line info iLine + 1
            }

            if (actualLine.length > expectedLine.length) {
                this.success = false;
                throw(this.strings.messages.tooManyChars.format(iLine + 1)); // add line info iLine + 1
            }
        }

        if (actualLines.length < expectedLines.length) {
            this.success = false;
            throw(this.strings.messages.tooFewLines);
        }

        if (actualLines.length > expectedLines.length) {
            this.success = false;
            throw(this.strings.messages.tooManyLines);
        }
    }

    getComponent() {
        return InputOutputVisualization;
    }

    provideBlocklyColours() {
        if ('bwinf' === this.infos.blocklyColourTheme) {
            return {
                categories: {
                    logic: 100,
                    loops: 180,
                    math: 230,
                    texts: 60,
                    lists: 40,
                    colour: 20,
                    variables: 330,
                    functions: 290,
                    read: 260,
                    print: 200,
                    manipulate: 0,
                    _default: 0
                },
                blocks: {}
            };
        }

        return super.provideBlocklyColours();
    }

    *getInputSaga(context) {
        console.log('HERE ASK INPUT');

        yield put(taskInputNeeded(true));
        if (context.display) {
            yield put(terminalFocus());
        }

        const {input} = yield race({
            interrupt: take(StepperActionTypes.StepperInterrupt),
            exit: take(StepperActionTypes.StepperExit),
            input: take(TaskActionTypes.TaskInputEntered),
        });

        console.log('RECEIVED INPUT', input);

        if (input) {
            const {payload: inputValue} = input;

            context.printer.ioEvents = [
                ...context.printer.ioEvents,
                {type: PrinterLineEventType.input, content: inputValue + "\n", source: PrinterLineEventSource.runtime},
            ];

            console.log('ADD NEW INPUT');

            if (context.display) {
                yield call(context.syncInputOutputBuffers, context);
            }

            return inputValue;
        }

        return false;
    }

    *syncInputOutputBuffers(context) {
        yield put({
            type: ActionTypes.BufferReset,
            buffer: inputBufferLib,
            model: documentModelFromString(context.getInputText()),
        });

        yield put({
            type: ActionTypes.BufferReset,
            buffer: outputBufferLib,
            model: documentModelFromString(context.getOutputText()),
        });

        let termBuffer = new TermBuffer({lines: 10, width: 60});
        termBuffer = writeString(termBuffer, context.getTerminalText());
        yield put(terminalReset(termBuffer));
    }

    *executionChannelSaga(context) {
        while (true) {
            const parameters = yield take(executionChannel);
            yield fork(context.handleRequest, context, parameters);
        }
    }

    *handleRequest(context, parameters) {
        const {action, payload, resolve, reject} = parameters;

        switch (action) {
            case PrinterLibAction.getInput: {
                const inputValue = IoMode.Split === context.ioMode ? context.getInputText() : yield call(context.getInputSaga, context);
                if (false !== inputValue) {
                    resolve(inputValue);
                }
                break;
            }
            case PrinterLibAction.readLine: {
                let result = '';
                if (IoMode.Split === context.ioMode) {
                    let inputValue = context.getFirstInput();
                    let index = inputValue.indexOf("\n");
                    if (index === -1) {
                        if (!inputValue) {
                            reject(context.strings.messages.inputEmpty);
                            return;
                        }
                        result = inputValue;
                        context.popFirstInput();
                    } else {
                        result = inputValue.substring(0, index);
                        console.log('READ', 'before', inputValue, 'after', inputValue.substring(index + 1));
                        context.replaceFirstInput(inputValue.substring(index + 1));
                    }
                } else {
                    result = yield call(context.getInputSaga, context);
                }

                if (context.display) {
                    yield put({
                        type: ActionTypes.BufferReset,
                        buffer: inputBufferLib,
                        model: documentModelFromString(context.getInputText()),
                    });
                }

                resolve(result);
                break;
            }
            case PrinterLibAction.reset: {
                const currentTest = yield select((state: AppStore) => state.task.currentTest);
                yield put({
                    type: ActionTypes.BufferReset,
                    buffer: inputBufferLibTest,
                    model: documentModelFromString(currentTest.input),
                });

                yield put({
                    type: ActionTypes.BufferReset,
                    buffer: outputBufferLibTest,
                    model: documentModelFromString(currentTest.output),
                });

                yield call(context.syncInputOutputBuffers, context);
                yield put(terminalInit(null));
                break;
            }
            case PrinterLibAction.printLine: {
                if (context.lost) {
                    return;
                }

                // Fix display of arrays
                const valueToStr = function(value) {
                    if (value && value.length !== undefined && typeof value == 'object') {
                        let oldValue = value;
                        value = [];
                        for (let i=0; i < oldValue.length; i++) {
                            if (oldValue[i] && typeof oldValue[i].v != 'undefined') {
                                // When used inside Skulpt (Python mode)
                                value.push(oldValue[i].v);
                            } else {
                                value.push(oldValue[i]);
                            }
                            value[i] = valueToStr(value[i]);
                        }
                        return '[' + value.join(', ') + ']';
                    } else if (value && value.isFloat && Math.floor(value) == value) {
                        return value + '.0';
                    } else if (value === true) {
                        return 'True';
                    } else if (value === false) {
                        return 'False';
                    }
                    return value;
                }

                let text = '';
                for (let i=0; i < payload.args.length; i++) {
                    text += (i > 0 ? ' ' : '') + valueToStr(payload.args[i]);
                }

                context.printer.ioEvents = [
                    ...context.printer.ioEvents,
                    {type: PrinterLineEventType.output, content: text + payload.end, source: PrinterLineEventSource.runtime},
                ];
                console.log('PRINT', text);

                if (context.display) {
                    yield put({
                        type: ActionTypes.BufferReset,
                        buffer: outputBufferLib,
                        model: documentModelFromString(context.getOutputText()),
                    });
                    yield put(terminalPrintLine(text + payload.end));
                }

                resolve();
                break;
            }
            default:
                throw 'Unknown action';
        }
    }

    *getSaga(app: App) {
        const context = this;
        yield fork(this.executionChannelSaga, this);

        yield takeEvery(ActionTypes.BufferEdit, function* (action) {
            // @ts-ignore
            const {buffer} = action;
            if (inputBufferLibTest === buffer) {
                const inputValue = yield select((state: AppStore) => state.buffers[inputBufferLibTest].model.document.toString());
                yield put(updateCurrentTest({input: inputValue}));
            }
            if (outputBufferLibTest === buffer) {
                const outputValue = yield select((state: AppStore) => state.buffers[outputBufferLibTest].model.document.toString());
                yield put(updateCurrentTest({output: outputValue}));
            }
        });

        // For replay purposes
        app.replayApi.on('buffer.edit', function(replayContext: ReplayContext, event) {
            const buffer = event[0];
            if (inputBufferLibTest === buffer) {
                const inputValue = replayContext.state.buffers[buffer].model.document.toString();
                taskSlice.caseReducers.updateCurrentTest(replayContext.state.task, updateCurrentTest({input: inputValue}));
            }
            if (outputBufferLibTest === buffer) {
                const outputValue = replayContext.state.buffers[buffer].model.document.toString();
                taskSlice.caseReducers.updateCurrentTest(replayContext.state.task, updateCurrentTest({output: outputValue}));
            }
        });

        yield takeEvery(terminalInputEnter.type, function* (action) {
            const inputValue = yield select((state: AppStore) => state.printerTerminal.lastInput);

            // yield put(terminalInputEnter()); // empty buffer
            yield put(taskInputNeeded(false));
            yield put(taskInputEntered(inputValue));
        });

        yield takeEvery(TaskActionTypes.TaskReset, function* (action: TaskResetAction) {
            const taskData = action.payload;
            if (!taskData.state) {
                return;
            }

            context.reloadState(taskData.state);

            if (context.display) {
                yield call(context.syncInputOutputBuffers, context);
            }
        });

        addAutoRecordingBehaviour(app, {
            sliceName: printerTerminalSlice.name,
            actionNames: printerTerminalRecordableActions,
            actions: printerTerminalSlice.actions,
            reducers: printerTerminalSlice.caseReducers,
            initialState: printerTerminalInitialState,
        });

        app.replayApi.onReset(function* (instant: PlayerInstant) {
            const taskData = instant.state.task;
            if (taskData) {
                yield put(taskReset(taskData));
                yield put(updateCurrentTest(taskData.currentTest));
                if (taskData.success) {
                    yield put(taskSuccess(taskData.successMessage));
                } else {
                    yield put(taskSuccessClear());
                }
                yield put(taskInputNeeded(taskData.inputNeeded));
            }
        });

        app.replayApi.on('start', function(replayContext: ReplayContext, event) {
            const {buffers} = event[2];
            if (buffers[inputBufferLibTest]) {
                const inputValue = buffers[inputBufferLibTest].document;
                taskSlice.caseReducers.updateCurrentTest(replayContext.state.task, updateCurrentTest({input: inputValue}));
            }
            if (buffers[outputBufferLibTest]) {
                const outputValue = buffers[outputBufferLibTest].document;
                taskSlice.caseReducers.updateCurrentTest(replayContext.state.task, updateCurrentTest({output: outputValue}));
            }
        });
    }
}
