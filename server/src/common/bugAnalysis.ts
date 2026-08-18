import { spawn, execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import BugReportModel, { BugReport } from "../models/bugReport.model";
import { notifyEmployee } from "./bugReportNotify";

const CLAUDE_BIN = process.platform === "win32" ? "claude.cmd" : "claude";
const ANALYSIS_TIMEOUT_MS = 3 * 60 * 1000;
const IMPLEMENTATION_TIMEOUT_MS = 8 * 60 * 1000;
// server/src/common -> repo root
const REPO_ROOT = path.resolve(__dirname, "../../..");
const execFileAsync = promisify(execFile);
// Read-only, argv is fixed and literal — no untrusted content, so no shell needed.
const GIT_BIN = process.platform === "win32" ? "git.exe" : "git";

function truncate(value: unknown, max = 3000): string {
    const str = typeof value === "string" ? value : JSON.stringify(value);
    return str.length > max ? `${str.slice(0, max)}...(truncated)` : str;
}

function runClaude(args: string[], prompt: string, cwd: string, timeoutMs: number): Promise<string> {
    return new Promise<string>((resolve, reject) => {
        // Fixed, literal argv only — the untrusted prompt is sent via stdin, never as a
        // shell-interpreted argument, since Windows requires shell:true to run .cmd files
        // and Node does not escape args in that mode.
        const child = spawn(CLAUDE_BIN, args, {
            cwd,
            timeout: timeoutMs,
            shell: process.platform === "win32",
        });

        let out = "";
        let errOut = "";
        child.stdout.on("data", (chunk) => { out += chunk; });
        child.stderr.on("data", (chunk) => { errOut += chunk; });
        child.on("error", reject);
        child.on("close", (code) => {
            if (code !== 0) return reject(new Error(`claude CLI exited with code ${code}: ${errOut}`));
            resolve(out);
        });

        child.stdin.write(prompt);
        child.stdin.end();
    });
}

function buildPrompt(report: BugReport): string {
    return [
        "You are triaging a bug report from an internal ERP application. You only have the data below — you have no access to the codebase, cannot run commands, and must not attempt to use any tools.",
        "Analyze it and respond with ONLY a single JSON object (no markdown fences, no prose outside the JSON) with exactly these keys:",
        '{"summary": string, "probableCause": string, "suggestedFix": string, "severity": "low"|"medium"|"high"|"critical"}',
        "",
        `Description: ${truncate(report.description)}`,
        `Route: ${truncate(report.route)}`,
        `User agent: ${truncate(report.userAgent)}`,
        `Console errors: ${truncate(report.consoleLog)}`,
        `Network errors: ${truncate(report.networkErrors)}`,
        `Recent user actions: ${truncate(report.actionTrail)}`,
    ].join("\n");
}

function buildImplementationPrompt(report: BugReport, analysis: Record<string, unknown>): string {
    return [
        "You are fixing a bug in this ERP codebase (you are running with your cwd set to the repo root and can read/edit files directly).",
        "A triage pass already produced the analysis below. Implement the smallest correct fix for it.",
        "",
        "Rules:",
        "- Only touch files directly relevant to this fix. Do not refactor, reformat, or change unrelated code.",
        "- Do not run any commands, do not use git, do not install packages.",
        "- Do not commit anything — just leave the edited files as working-tree changes.",
        "- If you cannot confidently identify or make the fix, make no edits and say so.",
        "- When done, respond with ONLY a single JSON object (no markdown fences, no prose outside the JSON):",
        '{"applied": boolean, "filesChanged": string[], "explanation": string}',
        "",
        `Bug summary: ${truncate(analysis.summary)}`,
        `Probable cause: ${truncate(analysis.probableCause)}`,
        `Suggested fix: ${truncate(analysis.suggestedFix)}`,
        `Original description: ${truncate(report.description)}`,
        `Route: ${truncate(report.route)}`,
    ].join("\n");
}

async function applyFixWithClaude(report: BugReport, analysis: Record<string, unknown>): Promise<Record<string, unknown>> {
    const prompt = buildImplementationPrompt(report, analysis);

    const stdout = await runClaude(
        [
            "-p",
            "--output-format", "json",
            "--permission-mode", "acceptEdits",
            "--allowedTools", "Read Edit MultiEdit Write Glob Grep",
        ],
        prompt,
        REPO_ROOT,
        IMPLEMENTATION_TIMEOUT_MS
    );

    const cliResult = JSON.parse(stdout);
    const resultText: string = cliResult.result || "";

    let parsed: Record<string, unknown>;
    try {
        const jsonMatch = resultText.match(/\{[\s\S]*\}/);
        parsed = JSON.parse(jsonMatch ? jsonMatch[0] : resultText);
    } catch {
        parsed = { applied: false, explanation: resultText };
    }

    let diffStat = "";
    try {
        const { stdout: diffOut } = await execFileAsync(GIT_BIN, ["diff", "--stat"], { cwd: REPO_ROOT });
        diffStat = diffOut.trim();
    } catch {
        // git not available or not a repo — non-fatal, just skip the diff stat
    }

    return {
        ...parsed,
        codeChanges: diffStat,
        implementationCostUsd: cliResult.total_cost_usd ?? null,
    };
}

export async function analyzeBugReportWithClaude(reportId: string): Promise<void> {
    const report = await BugReportModel.findById(reportId);
    if (!report) return;

    report.status = "analyzing";
    await report.save();

    try {
        const prompt = buildPrompt(report);
        const stdout = await runClaude(["-p", "--output-format", "json"], prompt, process.cwd(), ANALYSIS_TIMEOUT_MS);

        const cliResult = JSON.parse(stdout);
        const resultText: string = cliResult.result || "";

        let parsed: Record<string, unknown>;
        try {
            const jsonMatch = resultText.match(/\{[\s\S]*\}/);
            parsed = JSON.parse(jsonMatch ? jsonMatch[0] : resultText);
        } catch {
            parsed = { summary: resultText };
        }

        report.aiAnalysis = {
            ...parsed,
            analyzedAt: new Date(),
            costUsd: cliResult.total_cost_usd ?? null,
        };
        report.status = "implementing";
        await report.save();

        let applied = false;
        try {
            const implementation = await applyFixWithClaude(report, parsed);
            report.aiAnalysis = { ...report.aiAnalysis, ...implementation };
            applied = implementation.applied === true;
        } catch (implementationError) {
            console.log("Bug report fix implementation failed:", implementationError);
            report.aiAnalysis = {
                ...report.aiAnalysis,
                applied: false,
                implementationError: implementationError instanceof Error ? implementationError.message : String(implementationError),
            };
        }

        report.status = applied ? "resolved" : "fix-ready";
        await report.save();

        if (applied) {
            const bugSummary = String(report.aiAnalysis?.summary ?? report.description).slice(0, 120);

            if (report.reportingTo) {
                void notifyEmployee(report.reportingTo.toString(), {
                    type: 'BugReportResolved',
                    referenceModel: 'BugReport',
                    title: 'AI Resolved a Bug Report',
                    message: `Claude applied and resolved: ${bugSummary}`,
                    sentBy: report.reportingTo.toString(),
                    referenceId: report._id,
                });
            }

            if (report.reporterId) {
                void notifyEmployee(report.reporterId.toString(), {
                    type: 'BugReportResolved',
                    referenceModel: 'BugReport',
                    title: 'Your Bug Report Was Fixed',
                    message: `Your bug report "${bugSummary}" has been automatically fixed and resolved.`,
                    sentBy: report.reportingTo ? report.reportingTo.toString() : report.reporterId.toString(),
                    referenceId: report._id,
                });
            }
        }
    } catch (error) {
        console.log("Bug report AI analysis failed:", error);
        report.status = "failed";
        report.aiAnalysis = {
            error: "Analysis failed, will not retry automatically.",
            failedReason: error instanceof Error ? error.message : String(error),
            analyzedAt: new Date(),
        };
        await report.save();
    }
}
