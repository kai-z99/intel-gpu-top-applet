# Intel GPU Top Cinnamon Applet

This applet displays current Intel GPU usage in the Cinnamon panel using `intel_gpu_top`.

## Requirements

- Cinnamon desktop
- `intel_gpu_top` (usually from package `intel-gpu-tools`)

## Install

```bash

git clone https://github.com/kai-z99/intel-gpu-top-applet.git
cd intel-gpu-top-applet
chmod +x build.sh
./build.sh
```


After install:
```bash
sudo visudo
```

Add this line (replace `your_username` with your Linux username):

```text
your_username ALL=(root) NOPASSWD: /usr/bin/intel_gpu_top
```

1. Restart Cinnamon
2. Open panel applets and add **Intel GPU Top**.

## What It Shows

- Panel label example: `GPU 37%`
- Graph of usage % history
- Tooltip includes last update time and status.

## Uninstall

```bash
rm -rf ~/.local/share/cinnamon/applets/intel-gputop@kai
```
