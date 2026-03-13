const Applet = imports.ui.applet;
const Mainloop = imports.mainloop;
const Util = imports.misc.util;
const St = imports.gi.St;
const Cairo = imports.cairo;
const Clutter = imports.gi.Clutter;

const POLL_MS = 500;
const SAMPLE_MS = 100;
const COMMAND_TIMEOUT_SECONDS = 0.35;
const MOVING_AVG_WINDOW_SECONDS = 10;
const HISTORY_POINTS = Math.max(2, Math.round((MOVING_AVG_WINDOW_SECONDS * 1000) / POLL_MS));
const GRAPH_WIDTH = 54;
const MIN_GRAPH_HEIGHT = 14;

class IntelGpuTopApplet extends Applet.Applet {
    constructor(metadata, orientation, panelHeight, instanceId) {
        super(orientation, panelHeight, instanceId);

        this._timeoutId = 0;
        this._pollInFlight = false;
        this._usageHistory = [];
        this._graphHeight = Math.max(MIN_GRAPH_HEIGHT, panelHeight - 2);
        this._graphDisplayText = "GPU --";

        this.actor.add_style_class_name("intel-gputop");
        this._container = new St.BoxLayout({
            style_class: "intel-gputop-container",
            y_align: St.Align.MIDDLE
        });
        this._container.set_y_align(Clutter.ActorAlign.CENTER);
        this._container.set_y_expand(true);

        this._graph = new St.DrawingArea({
            style_class: "intel-gputop-graph",
            width: GRAPH_WIDTH,
            height: this._graphHeight
        });
        this._graph.set_y_align(Clutter.ActorAlign.CENTER);
        this._graph.connect("repaint", this._drawGraph.bind(this));

        this._container.add_child(this._graph);
        this.actor.add_child(this._container);
        this.set_applet_tooltip("Waiting for first GPU sample...");

        this._startPolling();
    }

    on_applet_clicked() {
        this._updateUsage();
    }

    on_applet_removed_from_panel() {
        this._stopPolling();
    }

    _startPolling() {
        this._stopPolling();
        this._updateUsage();

        this._timeoutId = Mainloop.timeout_add(POLL_MS, () => {
            this._updateUsage();
            return true;
        });
    }

    _stopPolling() {
        if (this._timeoutId) {
            Mainloop.source_remove(this._timeoutId);
            this._timeoutId = 0;
        }
    }

    _updateUsage() {
        if (this._pollInFlight) {
            return;
        }

        this._pollInFlight = true;
        const command =
            "bash -lc \"timeout " + COMMAND_TIMEOUT_SECONDS +
            "s intel_gpu_top -J -s " + SAMPLE_MS + " -o -\"";

        Util.spawnCommandLineAsyncIO(command, (stdout, stderr, exitCode) => {
            const now = new Date().toLocaleTimeString();
            const usage = this._extractUsagePercent(stdout || "");

            if (usage !== null) {
                this._setUsageDisplay(usage, now, "OK (intel_gpu_top)");
                this._pollInFlight = false;
                return;
            }

            if (this._isMissingCommand(stderr || "", exitCode)) {
                this._graphDisplayText = "GPU n/a";
                this._graph.queue_repaint();
                this.set_applet_tooltip("intel_gpu_top not found.\nInstall package: intel-gpu-tools");
                this._pollInFlight = false;
                return;
            }

            const errorType = this._classifyIntelGpuTopError(stderr || "", exitCode);
            const errorDetails = this._firstLine((stderr || "").trim()) || "No diagnostics from command.";

            this._trySudoIntelGpuTop((sudoUsage, sudoStderr) => {
                if (sudoUsage !== null) {
                    this._setUsageDisplay(sudoUsage, now, "OK (intel_gpu_top via sudo -n)");
                    this._pollInFlight = false;
                    return;
                }

                const needsSudoPassword = this._isSudoPasswordNeeded(sudoStderr || "");

                this._readSysfsUsage((sysfsUsage) => {
                    if (sysfsUsage !== null) {
                        this._setUsageDisplay(
                            sysfsUsage,
                            now,
                            "Fallback (sysfs GT freq proxy)",
                            "intel_gpu_top: " + errorType +
                            (needsSudoPassword ? "\nTip: allow passwordless sudo for intel_gpu_top." : "")
                        );
                    } else {
                        this._graphDisplayText = "GPU ?";
                        this._graph.queue_repaint();
                        this.set_applet_tooltip(
                            "intel_gpu_top failed: " + errorType + "\n" +
                            errorDetails + "\n" +
                            "Last update: " + now +
                            (needsSudoPassword ? "\nTip: allow passwordless sudo for intel_gpu_top." : "")
                        );
                    }

                    this._pollInFlight = false;
                });
            });
        });
    }

    _isMissingCommand(stderr, exitCode) {
        if (exitCode === 127) {
            return true;
        }

        return /command not found|not found/i.test(stderr);
    }

    _trySudoIntelGpuTop(callback) {
        const sudoCommand =
            "bash -lc \"timeout " + COMMAND_TIMEOUT_SECONDS +
            "s sudo -n intel_gpu_top -J -s " + SAMPLE_MS + " -o -\"";
        Util.spawnCommandLineAsyncIO(sudoCommand, (stdout, stderr) => {
            const usage = this._extractUsagePercent(stdout || "");
            callback(usage, stderr || "");
        });
    }

    _isSudoPasswordNeeded(stderr) {
        return /a password is required|password.*required|sudo: a terminal is required|sudo: .*password/i.test(stderr);
    }

    _setUsageDisplay(usage, now, status, extraLine) {
        this._recordUsage(usage);
        this._graph.queue_repaint();
        const usageText = this._formatUsage(usage);
        const avg = this._getMovingAverage();
        const avgText = avg === null ? "n/a" : this._formatUsage(avg);

        this._graphDisplayText = "GPU " + usageText + "%";
        this.set_applet_tooltip(
            "Intel GPU usage: " + usageText + "%\n" +
            "Avg (" + MOVING_AVG_WINDOW_SECONDS + "s): " + avgText + "%\n" +
            "Last update: " + now + "\n" +
            "Status: " + status +
            (extraLine ? "\n" + extraLine : "")
        );
    }

    _recordUsage(usage) {
        if (!isFinite(usage)) {
            return;
        }

        this._usageHistory.push(Math.max(0, Math.min(100, usage)));
        if (this._usageHistory.length > HISTORY_POINTS) {
            this._usageHistory.shift();
        }
    }

    _getMovingAverage() {
        if (this._usageHistory.length === 0) {
            return null;
        }

        const sum = this._usageHistory.reduce((acc, value) => acc + value, 0);
        return sum / this._usageHistory.length;
    }

    _drawGraph(area) {
        const cr = area.get_context();
        const [width, height] = area.get_surface_size();

        cr.setOperator(Cairo.Operator.CLEAR);
        cr.paint();
        cr.setOperator(Cairo.Operator.OVER);

        this._roundedRect(cr, 0.5, 0.5, width - 1, height - 1, 2);
        cr.setSourceRGBA(0.18, 0.2, 0.24, 0.35);
        cr.fill();

        if (this._usageHistory.length < 2) {
            this._drawOverlayText(cr, width, height);
            return;
        }

        const values = this._resampleHistory(Math.min(width - 2, HISTORY_POINTS));
        const left = 0.5;
        const top = 0.5;
        const graphW = width - 1;
        const graphH = height - 1;
        const stepX = values.length > 1 ? graphW / (values.length - 1) : graphW;

        cr.moveTo(left, top + graphH);
        for (let i = 0; i < values.length; i++) {
            const x = left + (i * stepX);
            const y = top + graphH - ((values[i] / 100) * graphH);
            cr.lineTo(x, y);
        }
        cr.lineTo(left + graphW, top + graphH);
        cr.closePath();
        cr.setSourceRGBA(0.24, 0.65, 0.96, 0.22);
        cr.fill();

        cr.setLineWidth(1.4);
        for (let i = 0; i < values.length; i++) {
            const x = left + (i * stepX);
            const y = top + graphH - ((values[i] / 100) * graphH);
            if (i === 0) {
                cr.moveTo(x, y);
            } else {
                cr.lineTo(x, y);
            }
        }
        cr.setSourceRGBA(0.30, 0.78, 1.0, 0.95);
        cr.stroke();

        this._drawOverlayText(cr, width, height);
    }

    _drawOverlayText(cr, width, height) {
        const fontSize = Math.max(8.0, Math.min(10.5, height * 0.52));
        cr.selectFontFace("Sans", Cairo.FontSlant.NORMAL, Cairo.FontWeight.BOLD);
        cr.setFontSize(fontSize);
        const extents = cr.textExtents(this._graphDisplayText);
        const textX = (width - extents.width) / 2 - extents.x_bearing;
        const textY = (height / 2) + (extents.height / 2) - 1;
        cr.setSourceRGBA(0.96, 0.98, 1.0, 0.95);
        cr.moveTo(textX, textY);
        cr.showText(this._graphDisplayText);
    }

    _resampleHistory(targetPoints) {
        if (this._usageHistory.length <= targetPoints) {
            return this._usageHistory.slice();
        }

        const result = [];
        const step = (this._usageHistory.length - 1) / (targetPoints - 1);
        for (let i = 0; i < targetPoints; i++) {
            const idx = i * step;
            const lower = Math.floor(idx);
            const upper = Math.ceil(idx);
            if (lower === upper) {
                result.push(this._usageHistory[lower]);
            } else {
                const t = idx - lower;
                const v = this._usageHistory[lower] + ((this._usageHistory[upper] - this._usageHistory[lower]) * t);
                result.push(v);
            }
        }

        return result;
    }

    _roundedRect(cr, x, y, w, h, r) {
        const radius = Math.min(r, w / 2, h / 2);
        cr.newSubPath();
        cr.arc(x + w - radius, y + radius, radius, -Math.PI / 2, 0);
        cr.arc(x + w - radius, y + h - radius, radius, 0, Math.PI / 2);
        cr.arc(x + radius, y + h - radius, radius, Math.PI / 2, Math.PI);
        cr.arc(x + radius, y + radius, radius, Math.PI, Math.PI * 1.5);
        cr.closePath();
    }

    _formatUsage(value) {
        return value.toFixed(1);
    }

    _classifyIntelGpuTopError(stderr, exitCode) {
        if (exitCode === 134 || /Assertion .* failed|Aborted|dumped core/i.test(stderr)) {
            return "intel_gpu_top crashed";
        }

        if (/permission denied|operation not permitted|CAP_PERFMON|perf_event_paranoid/i.test(stderr)) {
            return "permission issue";
        }

        if (exitCode === 124) {
            return "timed out";
        }

        if (exitCode !== 0) {
            return "command error (exit " + exitCode + ")";
        }

        return "parse error";
    }

    _firstLine(text) {
        if (!text) {
            return "";
        }

        const lines = text.split("\n").filter(line => line.trim().length > 0);
        return lines.length > 0 ? lines[0] : "";
    }

    _readSysfsUsage(callback) {
        const sysfsCommand =
            "bash -lc 'for d in /sys/class/drm/card[0-9]*; do " +
            "cur=\"$d/gt_cur_freq_mhz\"; min=\"$d/gt_RPn_freq_mhz\"; max=\"$d/gt_RP0_freq_mhz\"; " +
            "if [[ -r \"$cur\" && -r \"$min\" && -r \"$max\" ]]; then " +
            "c=$(<\"$cur\"); n=$(<\"$min\"); x=$(<\"$max\"); " +
            "if [[ \"$x\" -gt \"$n\" ]]; then " +
            "awk -v c=\"$c\" -v n=\"$n\" -v x=\"$x\" " +
            "\"BEGIN { p=((c-n)*100)/(x-n); if (p < 0) p = 0; if (p > 100) p = 100; printf \\\"%.1f\\\", p; }\"; " +
            "exit 0; fi; fi; done'";

        Util.spawnCommandLineAsyncIO(sysfsCommand, (stdout) => {
            const value = parseFloat((stdout || "").trim());
            if (isFinite(value)) {
                const clamped = Math.max(0, Math.min(100, value));
                callback(Math.round(clamped * 10) / 10);
                return;
            }

            callback(null);
        });
    }

    _extractUsagePercent(rawOutput) {
        if (!rawOutput || !rawOutput.trim()) {
            return null;
        }

        let values = this._extractEngineBusyFromJsonText(rawOutput);
        if (values.length === 0) {
            values = this._extractEngineBusyFromText(rawOutput);
        }

        if (values.length === 0) {
            return null;
        }

        let maxUsage = Math.max.apply(null, values);
        if (!isFinite(maxUsage)) {
            return null;
        }

        maxUsage = Math.max(0, Math.min(100, maxUsage));
        return Math.round(maxUsage * 10) / 10;
    }

    _extractEngineBusyFromJsonText(rawOutput) {
        const values = [];
        const engineBusyRegex = /"(Render\/3D\/\d+|Video\/\d+|Blitter\/\d+|Compute\/\d+|VideoEnhance\/\d+)"\s*:\s*\{[^{}]*?"busy"\s*:\s*([0-9]+(?:\.[0-9]+)?)/g;

        let match = null;
        while ((match = engineBusyRegex.exec(rawOutput)) !== null) {
            values.push(parseFloat(match[2]));
        }

        if (values.length > 0) {
            return values;
        }

        const genericBusyRegex = /"busy"\s*:\s*([0-9]+(?:\.[0-9]+)?)/g;
        while ((match = genericBusyRegex.exec(rawOutput)) !== null) {
            values.push(parseFloat(match[1]));
        }

        return values;
    }

    _extractEngineBusyFromText(rawOutput) {
        const values = [];
        const enginePercentRegex = /(Render\/3D\/\d+|Video\/\d+|Blitter\/\d+|Compute\/\d+|VideoEnhance\/\d+)[^\n]*?([0-9]+(?:\.[0-9]+)?)%/g;

        let match = null;
        while ((match = enginePercentRegex.exec(rawOutput)) !== null) {
            values.push(parseFloat(match[2]));
        }

        if (values.length > 0) {
            return values;
        }

        const fallbackPercentRegex = /([0-9]+(?:\.[0-9]+)?)%/g;
        while ((match = fallbackPercentRegex.exec(rawOutput)) !== null) {
            values.push(parseFloat(match[1]));
        }

        return values;
    }
}

function main(metadata, orientation, panelHeight, instanceId) {
    return new IntelGpuTopApplet(metadata, orientation, panelHeight, instanceId);
}
