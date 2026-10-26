# Cache Control for SillyTavern

A mobile-friendly panel to change prompt-caching settings (Claude, Gemini and any other cache keys) in `config.yaml` without opening the file.

## Install

**1. Install the extension**
Extensions (cube icon) → **Install extension** → paste this repo's URL → **Install**.

**2. One-time setup** (the panel can't edit `config.yaml` without it)

- Open `config.yaml` in your SillyTavern folder and set:
  ```yaml
  enableServerPlugins: true
  ```
- From your SillyTavern folder, copy the bundled plugin:

  Linux / macOS / Termux:
  ```
  cp -r data/default-user/extensions/SillyTavern-CacheControl/plugin plugins/cache-control
  ```
  Windows:
  ```
  xcopy /E /I data\default-user\extensions\SillyTavern-CacheControl\plugin plugins\cache-control
  ```
  If you installed the extension "for all users", the source folder is
  `public/scripts/extensions/third-party/SillyTavern-CacheControl/plugin`.
  If your user isn't `default-user`, change that part of the path.

- Restart SillyTavern.

**3. Use it**
Extensions → **Cache Control**. Change settings, tap **Save changes**.
A backup of your config is saved as `config.yaml.cache-control.bak` the first time you save.

## Updating
Update the extension from SillyTavern's extension manager. If the plugin changed, run the copy command again and restart.

## Settings explained
- **Cache the system prompt** (`claude.enableSystemPromptCache`): only useful if your system prompt doesn't change between messages.
- **Cache chat history at depth** (`claude.cachingAtDepth`): `-1` = off. `2` is a common choice.
- **Keep cache for 1 hour** (`claude.extendedTTL`): default is 5 minutes; the 1-hour cache costs more to write.
- Any other key in your config with "cache" or "ttl" in its name is listed automatically.
