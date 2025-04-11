/* eslint-disable capitalized-comments,max-len */
import { spawn } from "child_process";
import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";

// import { readFileSync } from 'fs';

/*
export async function lint_whole_project(log_channel: vscode.OutputChannel) {
  return create_diagnostics_for_all_output(await run_cppcheck(undefined, log_channel));
}

export async function lint_active_document(
  log_channel: vscode.OutputChannel) {
  if (vscode.window.activeTextEditor === undefined) {
    return { document: undefined, diagnostics: [] };
  }
  return await lint_document(
    vscode.window.activeTextEditor.document,
    log_channel);
}

export async function lint_document(
  file: vscode.TextDocument,
  log_channel: vscode.OutputChannel) {
  if (!['c', 'cpp'].includes(file.languageId) || file.uri.scheme !== 'file') {
    return [];
  }
  return create_diagnostics_for_all_output(await run_cppcheck(file.uri.fsPath, log_channel));
}
*/

export function runCppcheck(
  command: string[],
  logChannel: vscode.OutputChannel,
): Promise<string> {
  return new Promise((resolve, reject) => {
    logChannel.appendLine("Running: ".concat(command.join(" ")));
    const workingDirectory: string =
      typeof vscode.workspace.workspaceFolders === "undefined"
        || typeof vscode.workspace.workspaceFolders[0] === "undefined"
        ? ""
        : vscode.workspace.workspaceFolders[0].uri.fsPath;
    const cppcheckArguments = command.slice(1);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const process = spawn(command.at(0)!, cppcheckArguments, {
      cwd: workingDirectory,
    });
    if (process.pid) {
      let stderr = "";
      process.stdout.on("data", (data) => {
        logChannel.appendLine(data as string);
      });
      process.stderr.on("data", (data) => {
        let dataString = String(data);
        dataString = dataString.replaceAll("\"", "\\\"").replaceAll("|||", "\"");
        logChannel.appendLine(dataString);
        stderr += dataString;
      });
      process.stderr.on("end", () => {
        // Chop off the trailing \n and , from the raw Cppcheck output, then
        // wrap it all in [] to return a valid JSON array string.
        // eslint-disable-next-line no-magic-numbers
        const substringLength = stderr.length - 2;
        resolve(`[${stderr.substring(0, substringLength)}]`);
      });
      process.on("error", (err) => {
        logChannel.appendLine(err.message);
        reject(err);
      });
    } else {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises, @typescript-eslint/no-non-null-assertion
      vscode.window.showErrorMessage(`Failed to run ${command.at(0)!}`);
    }
  });
}

/**
 * Add the template argument to the command arguments.
 * @param commandArguments The array of command arguments to append to.
 */
function addTemplateArgument(commandArguments: string[]): void {
  commandArguments.push('--template={|||file|||:|||{file}|||,|||line|||:{line},|||column|||:{column},|||severity|||:|||{severity}|||,|||message|||:|||{message}|||,|||id|||:|||{id}|||},');
}

/**
 * Add the file argument to the command arguments if present.
 * @param commandArguments The array of command arguments to append to.
 * @param file The file to check, or undefined if not checking a specific file.
 */
function addFileIfPresent(commandArguments: string[], file?: string): void {
  if (file) {
    commandArguments.push(file);
  }
}

/**
 * Process the config file content and add relevant arguments to the command.
 * @param configFilePath Path to the config file
 * @param commandArguments The array of command arguments to modify
 */
function processConfigFile(configFilePath: string, commandArguments: string[]): void {
  if (fs.existsSync(configFilePath)) {
    const configContent = fs.readFileSync(configFilePath, 'utf8');
    const args = configContent.split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .filter((arg) => !arg.startsWith('--template'));
    commandArguments.push(...args);
  } else {
    commandArguments.push("--enable=all");
  }
}

/**
 * Get the Cppcheck command.
 * @param file The path to a specific file to check.
 * @returns An array of strings. The 0th element is the Cppcheck command. The
 * remaining elements are the command arguments.
 */
export function makeCppcheckCommand(file?: string) {
  const commandArguments = [
    // eslint-disable-next-line @typescript-eslint/non-nullable-type-assertion-style
    vscode.workspace.getConfiguration("cppcheck").get("cppcheck") as string,
  ];

  // Safely access workspaceFolders with optional chaining
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';

  const configuration = vscode.workspace.getConfiguration("cppcheck");

  // Use nullish coalescing operator instead of logical OR
  const configFileName = configuration.get<string>("configFile") ?? "";
  const configFilePath = path.isAbsolute(configFileName)
    ? configFileName
    : path.join(workspaceRoot, configFileName);

  try {
    processConfigFile(configFilePath, commandArguments);
  } catch (error) {
    // Use String() to fix template literal expression type issue
    console.error(`Failed to read config file ${String(configFilePath)}:`, error);
    commandArguments.push("--enable=all");
  }

  addTemplateArgument(commandArguments);
  addFileIfPresent(commandArguments, file);

  return commandArguments;
}

const severityMap = new Map<string, vscode.DiagnosticSeverity>([
  ["debug", vscode.DiagnosticSeverity.Information],
  ["error", vscode.DiagnosticSeverity.Error],
  ["information", vscode.DiagnosticSeverity.Information],
  ["none", vscode.DiagnosticSeverity.Hint],
  ["performance", vscode.DiagnosticSeverity.Information],
  ["portability", vscode.DiagnosticSeverity.Information],
  ["style", vscode.DiagnosticSeverity.Information],
  ["warning", vscode.DiagnosticSeverity.Warning],
]);

interface Issue {
  file: string;
  line: number;
  column: number;
  severity: "debug" | "error" | "information" | "none" | "performance" | "portability" | "style" | "warning";
  message: string;
  id: string;
}

// Just a convenience alias for this tuple type.
type DiagnosticTuple = [vscode.Uri, vscode.Diagnostic[]];

function createFileDiagnostic(issue: Issue): DiagnosticTuple {
  const d = new vscode.Diagnostic(
    new vscode.Range(
      issue.line - 1,
      Math.max(issue.column - 1, 0),
      issue.line - 1,
      Number.MAX_SAFE_INTEGER,
    ),
    issue.message,
    severityMap.get(issue.severity),
  );
  d.code = issue.id;
  d.source = "Cppcheck";
  return [vscode.Uri.file(issue.file), [d]];
}

function createNoFileDiagnostic(issue: Issue): DiagnosticTuple {
  const d = new vscode.Diagnostic(
    new vscode.Range(0, 0, 0, 0),
    issue.message,
    vscode.DiagnosticSeverity.Information,
  );
  d.code = issue.id;
  d.source = "cppcheck";
  return [vscode.Uri.file("nofile"), [d]];
}

function createDiagnostic(issue: Issue) {
  if (issue.file === "nofile") {
    return createNoFileDiagnostic(issue);
  }
  return createFileDiagnostic(issue);
}

export function parseIssues(cppcheckJsonOutput: string) {
  try {
    const issues = JSON.parse(cppcheckJsonOutput) as Issue[];
    // Filter out "Active checkers" and similar informational messages
    const filteredIssues = issues.filter((issue) => !(issue.file === "nofile"));
    const diagnostics = filteredIssues.map(createDiagnostic);
    return diagnostics;
  } catch (error) {
    if (error instanceof Error) {
      // I don't care what the user does with the error message.
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      vscode.window.showErrorMessage(`An error occurred parsing the Cppcheck output. The error is '${error.message}'. The output is ${cppcheckJsonOutput}`);
    }
  }
  return null;
}

/*
function extract_function_name(cppcheck_message: string): string {
  if (cppcheck_message.startsWith("The function '")) {
    const index = cppcheck_message.indexOf("'", 14);
    if (index === undefined) {
      return "";
    }
    return cppcheck_message.substr(14, index - 14);
  }
  return "";
}

function create_diagnostic_for_one_line(line: string, elevation: string): [vscode.Uri, vscode.Diagnostic[]] {
  const details = line.split("-:-");
  const function_name = extract_function_name(details[5]);
  const line_index = Math.max(0, parseInt(details[1]) - 1);
  const column_index = Math.max(0, parseInt(details[2]) - 1);
  const code_line = readFileSync(details[0], "utf-8").split("\n")[line_index];
  let diagnostic = new vscode.Diagnostic(
    get_function_range(line_index, column_index, function_name, code_line),
    details[5],
    to_vscode_severity(details[3], elevation)
  );
  diagnostic.code = `${details[4]}`;
  diagnostic.source = "Cppcheck";
  return [vscode.Uri.file(details[0]), [diagnostic]];
}

function to_vscode_severity(cppcheck_severity: string, elevation: string): vscode.DiagnosticSeverity {
  if (cppcheck_severity === "error" || elevation === "error") {
    return vscode.DiagnosticSeverity.Error;
  }
  if (cppcheck_severity === "warning" || elevation === "warning") {
    return vscode.DiagnosticSeverity.Warning;
  }
  return vscode.DiagnosticSeverity.Information;
}

function get_function_range(
  line_index: number,
  column_index: number,
  function_name: string,
  code_line: string): vscode.Range {
  if (function_name === "") {
    return new vscode.Range(line_index, column_index, line_index, column_index);
  }
  const start_character = code_line.indexOf(function_name);
  if (start_character < 0) {
    return new vscode.Range(line_index, column_index, line_index, column_index);
  }
  return new vscode.Range(
    line_index,
    start_character,
    line_index,
    start_character + function_name.length);
}
*/
