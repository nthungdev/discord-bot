# Rule: No Ticket ID References in Codebase

Do not include ticket IDs, issue keys, or tracking numbers (e.g., `OMA-XXX`, `JIRA-XXX`, `GH-XXX`, Linear issue identifiers) in:
- Source code files (variable names, comments, docstrings, imports)
- Documentation titles, headers, and descriptions
- Test file names and descriptions
- Commit messages and Pull Request titles (unless explicitly requested)

Always use descriptive, domain-focused terminology (e.g., "Smart Reply Design", "System Management Web Application", "Persistent Conversation Memory") instead of issue trackers.
