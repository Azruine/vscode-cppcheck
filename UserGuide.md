# VS Code Cppcheck User Guide

## Configuration Settings

### `cppcheck.cppcheck`

This is the path to the Cppcheck executable.
The default is just `cppcheck`, which assumes Cppcheck in your `PATH`.
If VS Code Cppcheck cannot run Cppcheck, it will display an error message.

### `cppcheck.configFile`

Path to a configuration file containing Cppcheck command-line arguments. The default value is `.cppcheck-config` in your workspace root.

You can either use a relative path (which will be resolved from the workspace root) or an absolute path to the configuration file.

#### Example Configuration File

Create a file named `.cppcheck-config` in your workspace root directory with each argument on a separate line:

```text
--enable=all
--quiet
--project=../build/compile_commands.json
--suppressions-list=.cppcheck-suppressions
```

Notes:

- Empty lines and lines starting with `#` are ignored
- The `--template` parameter will be ignored as the extension requires a specific template format for parsing
- If the configuration file is not found, the extension will use `--enable=all` as the default argument
