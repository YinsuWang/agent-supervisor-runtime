export class InvalidTransitionError extends Error {
  constructor(current: string, event: string) {
    super(`Invalid transition: ${current} + ${event}`);
    this.name = "InvalidTransitionError";
  }
}

export class SupervisorResponseInvalidError extends Error {
  constructor(message = "Supervisor response is invalid") {
    super(message);
    this.name = "SupervisorResponseInvalidError";
  }
}
