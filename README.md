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

## Active Branch
The `active` branch is where active development goes on. Generally consider don't using it unless you know what you are doing. It is periodically merged into the `main` branch for stable updates to the app. Only use the `active` branch if you would like to see active updates, but please note that it will have bugs, most likely. Your app will tell you if you are running the active branch.