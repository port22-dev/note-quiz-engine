# Linux basics and diagnostic commands

This sample contains five questions for Note Quiz Engine. All answers are supported by the notes below.

- The Linux kernel manages hardware resources such as the CPU, memory, and devices.
- `free` shows physical memory and swap usage. `free -h` uses human-readable units; `free -m` uses MiB.
- `df` shows disk space usage for file systems.
- `ls` lists files and directories.
- `ps` shows information about running processes.
- If a file system has too little free space to save a file, use `df` to inspect its disk usage. To inspect physical memory and swap, use `free`. Disk capacity and memory are different resources, so the appropriate command depends on what you want to check.

Click **Start quiz** at the top of this note. Short-answer questions use exact matching after trimming surrounding whitespace and normalizing line endings.

```quiz
quiz:
  id: "linux-kernel-role"
  type: choice
  question: "Which part of Linux manages CPU and memory resources when several applications run?"
  options:
    - "A Markdown heading"
    - "The Linux kernel"
    - "A web page"
    - "A directory listing"
  answer: 2
  explanation: "The Linux kernel manages hardware resources such as the CPU, memory, and devices."
  difficulty: "basic"
  tags:
    - "linux"
    - "kernel"
```

```quiz
quiz:
  id: "linux-memory-command"
  type: text
  question: "Name a command that shows physical memory and swap usage. You may include one of the display options described in this note."
  answers:
    - "free"
    - "free -h"
    - "free -m"
  explanation: "free shows physical memory and swap usage. The -h option uses human-readable units; -m uses MiB."
  tags:
    - "linux"
    - "memory"
```

```quiz
quiz:
  id: "linux-disk-troubleshooting"
  type: choice
  question: "A file cannot be saved because the file system has too little free space. Which command should you use to inspect its capacity?"
  options:
    - "free"
    - "ps"
    - "df"
    - "ls"
  answer: 3
  explanation: "df shows file system disk usage. The free command reports a different resource: memory."
  difficulty: "application"
  tags:
    - "linux"
    - "troubleshooting"
```

```quiz
quiz:
  id: "linux-process-command"
  type: text
  question: "Which command shows information about running processes? Give the command name without options."
  answers:
    - "ps"
  explanation: "ps shows running process information. The ls command lists files and directories."
  tags:
    - "linux"
    - "process"
```

```quiz
quiz:
  id: "linux-resource-reasoning"
  type: choice
  question: "df reports plenty of free disk space. Why would you still use free to check memory?"
  options:
    - "df and free always report the same resource."
    - "Disk space and memory are different resources."
    - "free automatically deletes saved files."
    - "df only reports running processes."
  answer: 2
  explanation: "df reports file system disk usage, while free reports memory and swap usage. Available disk space alone does not tell you the state of physical memory."
  difficulty: "application"
  tags:
    - "linux"
    - "reasoning"
```
