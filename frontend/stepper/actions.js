
import {defineAction} from '../utils/linker';

export default function* (deps) {

  // Sent when the stepper's state is initialized.
  yield defineAction('stepperRestart', 'Stepper.Restart');

  // Restore a saved or computed state.
  yield defineAction('stepperReset', 'Stepper.Reset');

  // Sent when the user requested stepping in a given mode.
  yield defineAction('stepperStep', 'Stepper.Step');

  // Sent when the stepper has started evaluating a step.
  yield defineAction('stepperStarted', 'Stepper.Start');

  // Sent when the stepper has been evaluating for a while without completing a step.
  yield defineAction('stepperProgress', 'Stepper.Progress');

  // Sent when the stepper has completed a step and is idle again.
  yield defineAction('stepperIdle', 'Stepper.Idle');

  // Sent when the user exits the stepper.
  yield defineAction('stepperExit', 'Stepper.Exit');

  // Sent when the user interrupts the stepper.
  yield defineAction('stepperInterrupt', 'Stepper.Interrupt');

  yield defineAction('stepperInterrupted', 'Stepper.Interrupted');

  yield defineAction('stepperUndo', 'Stepper.Undo');
  yield defineAction('stepperRedo', 'Stepper.Redo');

  yield defineAction('stepperConfigure', 'Stepper.Configure');

  yield defineAction('stepperStackUp', 'Stepper.Stack.Up');
  yield defineAction('stepperStackDown', 'Stepper.Stack.Down');

};