// SPDX-License-Identifier: MIT
// ================================================================================================
// THE HUMAN CHANNEL — /dev/tty, opened directly, never process.stdin.
//
// WHY NOT process.stdin. This kit is designed to be driven by an AI agent, and an agent that spawns
// `relics agent setup` owns that child's stdin. If a passphrase were read from process.stdin, the
// agent could supply one — and then the "only a human can authorize this" property would be a
// comment rather than a mechanism. /dev/tty is the CONTROLLING TERMINAL: a pipe cannot be one, so
// a value read here provably came from a keyboard attached to this session, not from a parent
// process, not from argv, and not from an environment variable.
//
// THE ECHO IS TURNED OFF WITH stty, ON THE TTY FD ITSELF. `stty` acts on its own stdin, so handing
// it the /dev/tty descriptor makes it act on the terminal even when the process's stdin is a pipe.
// Doing this through process.stdin.setRawMode() would silently do nothing in exactly that case —
// the case that matters — and the passphrase would be echoed into the agent's transcript.
//
// THE TERMINAL IS RESTORED ON EVERY EXIT PATH. A process that dies with -echo set leaves the
// creator with an invisible shell, which they will fix by typing blind or closing the window. Both
// signal handlers and the finally block exist for that, not for tidiness.
// ================================================================================================
import { closeSync, openSync, readSync, writeSync } from "node:fs";
import { execFileSync } from "node:child_process";

/** Raised when the human ended the prompt rather than answering it (Ctrl-C, Ctrl-D, EOF). */
export class PromptAborted extends Error {
  constructor(reason) {
    super(reason);
    this.name = "PromptAborted";
  }
}

/**
 * Can this machine ask a human a question at all?
 *
 * TWO CONDITIONS, BOTH REQUIRED, AND THEY ANSWER DIFFERENT QUESTIONS. `isTTY` says this invocation
 * was started interactively — it is what tells us an agent did not pipe us. /dev/tty says a
 * controlling terminal exists to read from. A daemon can fail the first and pass the second; a
 * process whose stdin was redirected from a file passes neither.
 */
export function ttyCapability() {
  if (process.platform === "win32") {
    return { ok: false, code: "NO_DEV_TTY_ON_PLATFORM", detail: "This step reads a secret from /dev/tty so that no parent process can supply it. Windows has no /dev/tty, so this command refuses rather than falling back to standard input — a fallback would quietly remove the only thing that makes the secret a human's. Run it under WSL, or use a machine with a POSIX terminal." };
  }
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return { ok: false, code: "NOT_INTERACTIVE", detail: "This command is not attached to a terminal. It asks a human for a secret, and a secret that arrives down a pipe is not a human's answer — it is whatever started this process. A person must run this command themselves, in their own terminal." };
  }
  let fd = null;
  try {
    fd = openSync("/dev/tty", "r+");
    return { ok: true, code: "TTY", detail: "a controlling terminal is available" };
  } catch (err) {
    return { ok: false, code: "NO_CONTROLLING_TERMINAL", detail: `/dev/tty could not be opened (${err && err.code ? err.code : "unknown"}). Without a controlling terminal there is nowhere to read a secret from that a parent process cannot also write to.` };
  } finally {
    if (fd !== null) {
      try { closeSync(fd); } catch { /* closing a probe is best-effort */ }
    }
  }
}

/** One sentence a caller can print when it refuses. Kept here so every refusal says the same thing. */
export function ttyRefusalMessage(capability, what) {
  return `${what} needs a human at a terminal. ${capability.detail}`;
}

function sleepMs(ms) {
  // A synchronous sleep, used only on EAGAIN. Node may hand back a non-blocking descriptor on some
  // platforms; spinning on it would burn a core while the creator thinks about their passphrase.
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * A session bound to the controlling terminal.
 *
 * The terminal stays in CANONICAL mode throughout, echo being the only thing toggled. That is what
 * `read -s` does and it is why backspace, ^U and ^W keep working inside a passphrase: the kernel
 * does the line editing and hands over one finished line. A raw-mode reimplementation of line
 * editing would be a second, worse one.
 */
export function openTty() {
  const fd = openSync("/dev/tty", "r+");
  let echoOff = false;
  let closed = false;

  const setEcho = (on) => {
    try {
      execFileSync("stty", [on ? "echo" : "-echo"], { stdio: [fd, "ignore", "ignore"] });
      echoOff = !on;
      return true;
    } catch {
      return false;
    }
  };

  const restore = () => {
    if (echoOff) setEcho(true);
  };

  // If the creator interrupts mid-passphrase the terminal must come back. Registered once for the
  // life of the session and removed on close, so nothing leaks between commands.
  const onSignal = () => {
    restore();
    try { writeSync(fd, "\n"); } catch { /* the terminal may already be gone */ }
    process.exit(130);
  };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);

  const write = (text) => {
    if (closed) return;
    try { writeSync(fd, text); } catch { /* a vanished terminal is not worth throwing over */ }
  };

  const readLine = () => {
    const chunk = Buffer.alloc(4096);
    let acc = Buffer.alloc(0);
    for (;;) {
      let n;
      try {
        n = readSync(fd, chunk, 0, chunk.length, null);
      } catch (err) {
        if (err && (err.code === "EAGAIN" || err.code === "EWOULDBLOCK")) { sleepMs(20); continue; }
        if (err && err.code === "EINTR") continue;
        throw err;
      }
      if (n === 0) {
        if (acc.length === 0) throw new PromptAborted("end of input");
        break;
      }
      acc = Buffer.concat([acc, chunk.subarray(0, n)]);
      const nl = acc.indexOf(0x0a);
      if (nl !== -1) { acc = acc.subarray(0, nl); break; }
    }
    chunk.fill(0);
    const line = acc.toString("utf8").replace(/\r$/, "");
    acc.fill(0);
    return line;
  };

  return {
    write,
    /** Ask for something the creator should SEE as they type it: an address, a number, a choice. */
    ask(question) {
      write(question);
      return readLine();
    },
    /**
     * Ask for a secret. Echo is off for the duration and restored before this returns, including on
     * the throw path — a passphrase prompt that fails must not leave the next one invisible.
     */
    askSecret(question) {
      write(question);
      if (!setEcho(false)) {
        write("\n");
        throw new Error("Echo could not be turned off on this terminal, so a passphrase typed here would be visible and would land in the scrollback of whatever is watching. Refusing to ask for it. (`stty` must be on PATH.)");
      }
      try {
        const value = readLine();
        write("\n");
        return value;
      } finally {
        restore();
      }
    },
    close() {
      if (closed) return;
      closed = true;
      restore();
      process.removeListener("SIGINT", onSignal);
      process.removeListener("SIGTERM", onSignal);
      try { closeSync(fd); } catch { /* best effort */ }
    },
  };
}

/** Open a tty, run `fn` with it, and close it however `fn` ends. */
export async function withTty(fn) {
  const tty = openTty();
  try {
    return await fn(tty);
  } finally {
    tty.close();
  }
}
