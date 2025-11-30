# ExGPT
A client for Claude AI with experimental new features!

Lots of cool toggles and modes and stuff :D

To run, for testing from source, run:

```shell
npm install
npm start
```

To build from source:

```shell
npm run dist:all # Builds for all platforms
npm run dist:mac # Builds universal macOS .dmg
npm run dist:win # Builds portable Windows .exe
npm run dist:linux # Builds AppImage for Linux
npm run dist:mac:nodev # Builds universal macOS .dmg without code signing - use if you don't have an Apple Developer Program membership
npm run dist:all:nodev # Builds for all platforms except like dist:mac:nodev for mac
```

Uses Electron Builder.

To update, you can instal the latest binary from the Releases and replace the old binary. Data is stored in Electron app data.