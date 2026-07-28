# Linux Install and Update

Desktop install on Linux is not one-click like the macOS `.dmg` or Windows
`.exe`. Releases publish three formats — pick by distro, then download from
[the latest GitHub release](https://github.com/stablyai/orca/releases/latest).

For `orca serve` on a machine without a desktop session, use the
[headless Linux server guide](./headless-linux-server.md) instead. Builds need
glibc 2.31+ (Ubuntu 20.04 / Debian 11 / RHEL 9 and newer); see
[Linux glibc compatibility](./linux-glibc-compatibility.md).

## Choose a package

| Format | Best for | Architectures |
| --- | --- | --- |
| **`.deb`** | Debian, Ubuntu, and derivatives | `amd64`, `arm64` |
| **`.rpm`** | Fedora, RHEL, openSUSE, and derivatives | `x86_64`, `aarch64` |
| **AppImage** | Most distros with glibc 2.31+ (portable; no package manager) | x64 (`orca-linux.AppImage`), arm64 (`orca-linux-arm64.AppImage`) |

Arch users can also install the community AUR package `stably-orca-bin` (or
`stably-orca-git` to build from source). That is not a GitHub release asset.

Confirm your machine arch before downloading:

```bash
uname -m
# x86_64 → amd64 / x86_64 assets
# aarch64 / arm64 → arm64 / aarch64 assets
```

## Download

Asset names on the latest release:

| Arch | AppImage | Debian package | RPM |
| --- | --- | --- | --- |
| x64 | `orca-linux.AppImage` | `orca-ide_<version>_amd64.deb` | `orca-ide-<version>.x86_64.rpm` |
| arm64 | `orca-linux-arm64.AppImage` | `orca-ide_<version>_arm64.deb` | `orca-ide-<version>.aarch64.rpm` |

AppImage filenames are stable across releases. `.deb` / `.rpm` names include the
version — grab them from the release page, or resolve the name first:

```bash
# Example: latest amd64 .deb name (requires jq + curl)
tag=$(curl -fsSL https://api.github.com/repos/stablyai/orca/releases/latest | jq -r .tag_name)
ver="${tag#v}"
curl -fL "https://github.com/stablyai/orca/releases/download/${tag}/orca-ide_${ver}_amd64.deb" \
  -o "orca-ide_${ver}_amd64.deb"
```

With the GitHub CLI:

```bash
gh release download --repo stablyai/orca --pattern 'orca-linux.AppImage'
gh release download --repo stablyai/orca --pattern 'orca-ide_*_amd64.deb'
gh release download --repo stablyai/orca --pattern 'orca-ide-*.x86_64.rpm'
```

Direct AppImage URLs (always point at latest):

- https://github.com/stablyai/orca/releases/latest/download/orca-linux.AppImage
- https://github.com/stablyai/orca/releases/latest/download/orca-linux-arm64.AppImage

## Install

### AppImage (any distro)

```bash
curl -fL https://github.com/stablyai/orca/releases/latest/download/orca-linux.AppImage \
  -o orca-linux.AppImage
chmod +x orca-linux.AppImage
./orca-linux.AppImage
```

Use `orca-linux-arm64.AppImage` on arm64 hosts.

**FUSE:** many distros need `libfuse2` (Ubuntu 22.04) or `libfuse2t64` (Ubuntu
24.04 / current Debian) for the AppImage to mount. Without FUSE, extract once:

```bash
./orca-linux.AppImage --appimage-extract
./squashfs-root/AppRun
```

Docker and other environments without a FUSE device should use extract (or
`--appimage-extract-and-run`) rather than privileged FUSE mounts.

### Debian / Ubuntu (`.deb`)

```bash
# Prefer apt so dependencies resolve:
sudo apt install ./orca-ide_<version>_amd64.deb

# Or:
sudo dpkg -i orca-ide_<version>_amd64.deb
sudo apt-get install -f   # if dpkg reports missing deps
```

Replace `_amd64` with `_arm64` on arm64 hosts. Launch from the app menu, or run
`orca` if the package installs a desktop entry / binary on `PATH`.

### Fedora / RHEL / openSUSE (`.rpm`)

```bash
# Fedora / RHEL (dnf):
sudo dnf install ./orca-ide-<version>.x86_64.rpm

# Or rpm directly:
sudo rpm -i orca-ide-<version>.x86_64.rpm
```

Use the `.aarch64.rpm` on arm64. On openSUSE, `zypper install ./orca-ide-<version>.x86_64.rpm`
works the same way for a local file.

## Update

There is no distro apt/dnf repository from the Orca project for release builds.
Update by installing a newer release over the old one:

| Format | Update path |
| --- | --- |
| **AppImage** | Download the new AppImage, `chmod +x`, replace the old file (same path keeps any desktop shortcut you created). |
| **`.deb`** | Download the new `.deb`, then `sudo apt install ./orca-ide_<new>_….deb` (or `dpkg -i`). |
| **`.rpm`** | Download the new `.rpm`, then `sudo dnf upgrade ./orca-ide-<new>-….rpm` (or `rpm -U`). |
| **AUR** | `yay -Syu stably-orca-bin` (or your AUR helper’s upgrade). |

AppImage auto-update may prompt inside the app when a newer release is
published; if it does not, re-download from the latest release link above.

## Troubleshooting

| Symptom | What to try |
| --- | --- |
| **Wrong arch** (`Exec format error`, or package refuses to install) | Match `uname -m` to the asset table. x86_64 ≠ arm64. |
| **AppImage: “fuse: device not found” / fails to mount** | Install `libfuse2` / `libfuse2t64`, or use `--appimage-extract` (see above). |
| **Permission denied on AppImage** | `chmod +x` the file; avoid mounting the download as `noexec`. |
| **Sandbox / chrome-sandbox errors on launch** | Common on some locked-down hosts. Prefer the `.deb` / `.rpm` package, or run the extracted AppImage. Do not broadly disable the sandbox on multi-user machines. |
| **App won’t start / missing glibc symbols** | Host is older than the supported floor (glibc 2.31+). See [Linux glibc compatibility](./linux-glibc-compatibility.md). |
| **Headless / no DISPLAY** | Use [headless Linux server](./headless-linux-server.md) (`orca serve` + Xvfb). |

Browse every published file: https://github.com/stablyai/orca/releases/latest
