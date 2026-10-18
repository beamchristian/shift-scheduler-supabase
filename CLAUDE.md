# Working rules for this project

These rules apply to every change, new or edited, in this repository.

## Names
- Use descriptive names for variables, parameters, function arguments, types and files.
  Write `departmentId`, not `dept` or `d`. Write `scheduleRows`, not `rows2`.
- Short names are fine only for a trivial loop index (`i`) or a callback that uses one value.
- Common abbreviations are fine in names only when they are the standard term (`id`, `url`, `pdf`).

## Comments
- Put a comment above every function, exported type and interface. Say what it does and what it returns.
- Put a comment above any block that is not obvious from its names. Explain *why*, not *what*.
- Keep comments short and plain. Write them so someone new to the project can follow the code.

## Format
- Keep one style across the project: two-space indent, double quotes in new files, trailing commas,
  and a blank line between functions.
- Prefer small functions with one job over long functions with many steps.
