# Intel GPU Top Cinnamon Applet

This applet displays current Intel GPU usage in the Cinnamon panel using `intel_gpu_top`.

## Requirements

- Cinnamon desktop
- `intel_gpu_top` (usually from package `intel-gpu-tools`)

## Install

```bash
# If you already have the repo:
cd /path/to/gputop

# Or clone it first, then enter it:
# git clone <your-repo-url> gputop
# cd gputop

chmod +x build.sh
./build.sh
```

After install:

1. Restart Cinnamon (or log out/in). You can also try `cinnamon --replace`.
2. Open panel applets and add **Intel GPU Top**.

## What It Shows

- Panel label example: `GPU 37%`
- Tooltip includes last update time and status.
- If `intel_gpu_top` is missing or output cannot be parsed, applet shows fallback text instead of crashing.

## Troubleshooting

- `GPU n/a`: `intel_gpu_top` is likely not installed or not in PATH.
- `GPU ?`: command ran but output could not be parsed; check command manually:

```bash
intel_gpu_top -J -s 1000 -o -
```

- Permission errors: `intel_gpu_top` may require elevated perf permissions depending on distro config.

## Verification Checklist

- Run `./build.sh` and confirm applet files appear in `~/.local/share/cinnamon/applets/intel-gputop@kai`.
- Add the applet in Cinnamon and verify the panel label updates like `GPU 12%`.
- Stop or hide `intel_gpu_top` from PATH and verify fallback label `GPU n/a`.
- Force a bad command output (or parser mismatch) and verify fallback label `GPU ?` without applet crash.

## Uninstall

```bash
rm -rf ~/.local/share/cinnamon/applets/intel-gputop@kai
```
