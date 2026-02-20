export class CliError extends Error {
  code: string;
  exitCode: number;

  constructor(message: string, code = "ERR_CLI", exitCode = 1) {
    super(message);
    this.name = "CliError";
    this.code = code;
    this.exitCode = exitCode;
  }
}
