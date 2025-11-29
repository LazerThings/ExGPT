# ExGPT
A client for Claude AI with experimental new features!

Lots of cool toggles and modes and stuff :D

To run, either download a binary in the Releases, or for testing from source, run:

```shell
npm install
npm start
```
for dev testing.

To build from source:

```shell
npm run dist:all # Builds for all platforms
npm run dist:mac # Builds universal macOS .dmg
npm run dist:win # Builds portable Windows .exe
npm run dist:linux # Builds AppImage for Linux
```

Uses Electron Builder.

To update, you can instal the latest binary from the Releases and replace the old binary. Data is stored in Electron app data.