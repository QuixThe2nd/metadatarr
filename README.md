# Metadatarr: The missing arr for torrent management
Like Sonarr for your torrent queue: Intelligent automation for power users managing large collections.

Metadatarr is a highly modular Torrent automation tool giving you surgical control over your torrents. It continuously monitors your BitTorrent client and applies rules you define to manage everything automatically.

## Features
- **Actions**: Automatically performs actions on your torrents based on custom rules IF/THEN rules (e.g. resume stopped torrents if above 95% complete, delete errored ones in a category, recheck missing files, etc.)
- **Sort**: Automatically reorders your queue based off sophisticated custom chained rules (e.g. prefer small torrents BUT de-prioritise public torrents BUT prefer Sonarr torrents BUT prefer torrent names with "S01")
- **Queue**: Automatically changes download queue size based off a configurable total size limit
- **Naming**: Parses torrent titles and automatically renames them based off custom naming schemes
- **Metadata**: Automatically fetches .torrent files for magnet links using external HTTP sources and DHT

## Overview
If you're running Sonarr/Radarr with thousands of torrents, you need Metadatarr to intelligently manage that library.

It's the automation layer that:
- Runs custom automations defined by you with customisable triggers
- Decides which torrents download first
- Decides how many torrents to download at once
- Standardises naming across your entire collection
- Automatically fetches metadata for magnet links
- Integrates with [Cross-Seed](https://cross-seed.org) for tracker upgrades
- And much more

Built for users with hundreds or thousands of torrents who need enterprise-level queue management.

## Core Features
### Actions
Arguably the most powerful feature Metadatarr provides is actions. Actions are highly customisable and allow you to define custom automation rules in JSON.
- **Highly Customisable**: Actions are super customisable, so much so that it's a pseudo-DSL, with JSON syntax
- **Custom Trigger**: Configure custom triggers based on any variable (e.g. if progress < 10% && state == stopped)
- **Custom Actions**: Stop, Start, add/remove tags, change category, etc.

### Queue Management
Intelligent queue management with custom flags like "Prefer S01 episodes", "Prefer private torrents", or "Finish torrents closest to completion".
- **Highly Configurable**: Sort based on custom rules you define
- **Advanced Sorting**: Multi-criteria sorting with tie-breaker logic
- **Conditional Sorting**: Define separate rules based on variables (e.g. sort checking by progress and downloads by size)
- **Download Limits**: Configure rules for how many torrents can download at a time based on size

### Renaming Rules
Configure automatic renaming based on custom schemas, making all your torrents in qBittorrent follow a uniform standard. For example, restructure names to `[title] ([year]) [resolution]`.
- **Uniform Naming**: Makes your qBittorrent and it's download folder pretty (and parsable) with all torrents following identical naming formats
- **Advanced Parsing**: Parses torrent names and exposes dozens of tags for custom naming schemes
- **Clean Up Junk**: Removes useless information like domains from torrent names

### Metadata Recovery
When qBittorrent only has magnet links, it can't see filenames, sizes, etc. until it is able to fetch the metadata. Metadatarr proactively fetches the `.torrent` file to provide this metadata immediately.
- **Multi-Source Fetching**: WebTorrent DHT, HTTP Endpoints, & Web Scraping
- **Automatic Retry**: Periodically checks old torrents to find newly available metadata
- **Local Torrent Import**: Scans configured directories for new .torrent files

### Cross-Seed Integration
Integrates with [Cross-Seed](https://cross-seed.org) so when a cross seed is found, it removes the original if it matches customisable rules, for example if original is from a public tracker.
- **Automatic Upgrades**: Trump releases based on certain rules with preferred torrents
- **Webhook Support**: Integrates with Cross-Seed via a webhook for instant replacement
- **Smart Cleanup**: Removes redundant public torrents

## Manual Install
```
git clone https://github.com/QuixThe2nd/metadatarr
cd metadatarr
npm install
```

### Note
Metadatarr uses [PTT](https://github.com/clement-escolano/parse-torrent-title) as a core dependency for automated renaming.

However since Metadatarr is currently under heavy development, I maintain a [fork of PTT](https://github.com/QuixThe2nd/parse-torrent-title). The fork fixes many unsolved edge cases in the original library as well as includes new flags and handlers, however this fork has many un-reviewed changes and may result in false positives. These false positives are only ever temporary, meaning once they're patched, any false renames caused by them will be undone (assuming you setup `TORRENTS_DIR` in `Naming.jsonc`).

For now, while both PTT and Metadatarr face several major changes, you must choose which fork you'd like to use. Either my fork with more handlers but more false positives, or the original with less handlers but less false positives.

After you've chosen the fork you'd like to use, you must `git clone` the fork to the same directory Metadatarr has been cloned to, so you must have a `metadatarr` and a `parse-torrent-title` folder next to each other.

This is temporary. Metadatarr will eventually migrate to using the primary repo once majority of edge cases are solved.

## Docker
To run via Docker, create a file called `docker-compose.yml` and paste the following:
```
services:
  metadatarr:
    image: ghcr.io/quixthe2nd/metadatarr
    container_name: metadatarr
    restart: unless-stopped
    ports:
      - 9191:9191
    volumes:
      - /srv/docker/metadatarr:/app/metadatarr/store
      - /mnt/external/qBittorrent/Torrents:/torrents
```
Then run `docker compose up -d`

## Configuration
The default config for Metadatarr's core is located at `CoreSchema` and `ClientSchema` in `./src/schemas.ts`. To modify values, create files in `./store/config` named `core.jsonc` and `.client.jsonc` respectively. All default plugins also have their own `ConfigSchema`. To modify default plugin config, create a file at `./store/config/plugins/plugin_name.jsonc`. Any config value you haven't defined will fallback to the defaults.

Instructions for each config are provided in each file. **READ ALL CONFIG BEFORE RUNNING!** The defaults are set as examples showcasing the power of Metadatarr, not as the recommended settings.

Note that changes apply instantly on save, you do not need to restart Metadatarr. The only exception to that is `Uncross-Seed` which needs a manual restart.

## Usage
To start Metadatarr, run:
```
npx tsx src
```

## Uncross-Seed
To enable [Cross-Seed](https://www.cross-seed.org/) integration, [configure a webhook](https://www.cross-seed.org/docs/basics/options#notificationwebhookurls). Set the notification webhook URL to `http://localhost:9191/plugins/Uncross-Seed`.

## Triggering Jobs
Metadatarr runs automatically on an interval, the more frequently it runs, the better. However on less powerful machines, frequent runs may cause slow-downs. Depending on your rules, you might be better off setting a much slower frequency of job runs and instead configure your BitTorrent client to trigger jobs when new torrents are added. This can be done by running `curl -X POST http://localhost:9191/api/run-jobs` on torrent add (or complete).

## Plugins
Metadatarr is highly modular, every feature you see is a plugin (e.g. `Sort`, `Actions`, etc.). You can see `./plugins` for a list of all built-in plugins. To disable a plugin so it doesn't run, simply prepend `_` to the start of the name, like `_Stats.ts`. Plugins can be built in either TS or JS, no build step is required if using TS, so I highly recommend shipping your plugins using TS.

To build a plugin, create a file called `MyPlugin.ts` (or `MyPlugin.js`) and place it in the `./plugins` directory. Plugins have 3 components; a hook, endpoint, and config schema. Each component is optional depending on your needs.

### ConfigSchema
The `ConfigSchema` allows you to define configurable fields. This is done using Zod. To define a config schema, export a `z.object` with the name `ConfigSchema`. You are also able (and recommended) to set default values for each config field.
```ts
import z from 'zod';

export const ConfigSchema = z.object({
  VARIABLE_1: z.boolean().default(true),
  VARIABLE_2: z.number().default(10),
  VARIABLE_3: z.array(z.string()).default(["abc"]),
  VARIABLE_4: z.object({
    VARIABLE_5: z.number().default(0),
    VARIABLE_6: z.string().default("xyz"),
  }),
});
```

Users can then define custom config in `./store/plugins/MyPlugin.jsonc`. Metadatarr will automatically import, parse, and validate user config (if any) and pipe it to your plugin when called along with defaults when needed.

### Endpoints
Plugins are also able to create endpoints to receive HTTP requests. To create an endpoint, you need to export a nested function that looks like this:
```ts
import type { Request, Response } from 'express';

export const endpoint = (client: Client, config: z.infer<typeof ConfigSchema>) => {
  // Do something on import
  return async (req: Request, res: Response): Promise<void> => {
    // Do something on each request
    res.status(200).send();
  }
}
```
Or in JS:
```ts
export const endpoint = (client, config) => {
  // Do something on import
  return async (req, res) => {
    // Do something on each request
    res.status(200).send();
  }
}
```
Metadatarr will then listen on `http://localhost:9191/plugins/MyPlugin` and forward all requests to your function. The main `endpoint` function is called only when the plugin is first imported, therefore if the users changes any config, Metadatarr needs to be restarted for your endpoint to receive the new config. The child function is piped directly to Express and will be called each time your endpoint is called.

### Hooks
Hooks are called on an interval. Each time they're called the latest user defined config is passed, so no restart is required if you are only using config for hooks.

To create a hook, you need to export a function named `hook`:
```ts
import type Torrent from "../src/classes/Torrent";
import type { Instruction } from "../src/schemas";

export const hook = ({ torrents, client, config }: PluginInputs<z.infer<typeof ConfigSchema>>): Instruction[] => {}
// or
export const hook = async ({ torrents, client, config }: PluginInputs<z.infer<typeof ConfigSchema>>): Promise<Instruction[]> => {}
```
Or in JS:
```js
export const hook = ({ torrents, client, config }) => {}
// or
export const hook = async ({ torrents, client, config }) => {}
```

Hooks can return an array of instructions Metadatarr uses to modify torrents or directly interface with client settings. For a full list of available instructions, check `InstructionSchema` in `./src/schemas.ts`.

These instructions can look like so:
```json
[
  { "hash": "0123456789abcdef", "then": "start" },
  { "hash": "0123456789abcdef", "then": "rename", "arg": "Ubuntu 22.04" },
  { "then": "setMaxActiveDownloads", "arg": 5 }
]
```

Each torrent in the `torrents` array passed to your hook has an interface the can be used to interact directly with torrents. There is also a `client` argument that can be used to directly interface with the BitTorrent client for global settings. These are only provided as a last resort in case you have a use case that for whatever reason is not natively supported by the instruction schema. However I ask that you submit a GitHub issue (or PR) if you find new use-cases not natively supported.

Although everything the instruction schema can do is possible by natively interacting with torrent and client objects, it is highly discouraged. Metadatarr has built in optimisers that reduce the number of API calls made to the underlying BitTorrent client.

For example, when testing on my personal library with ~5k torrents at the time of writing, each run, the default hooks return a combined 16k instructions. After a simple de-duplication, the number of instructions shrinks to 10k. Then finally after diffing against my qBitTorrent state, the total number of calls each run is ~8. Interfacing directly with the BitTorrent client will result in many redundant calls, or require time optimising calls that Metadatarr can optimise (better than you) automatically. Even with the best optimisations, you still won't be able to beat Metadatarr's built in optimiser, simply because your plugin is unaware of what other plugins are doing.

### QueryEngine
You are free to build your plugin however you like. However when writing the default plugins, I found that there was a lot of overlap in the logic, so I built the `QueryEngine`. The QueryEngine is a powerful tool that allows you to filter or sort torrents based on custom rules. I highly recommend you use the QueryEngine in your plugins when you want to allow users to apply rules to certain torrents only.

The 2 most obvious use-cases for this are the `Actions` and `Sort` plugins which rely almost exclusively on the QueryEngine. I highly recommend you take a look at them to see how powerful it can be. Here I'll walk you through a basic demo of using the QueryEngine.

Using the QueryEngine, you're able to define SQL-like queries to filter torrents. Here, we find torrents where the tracker url contains `aither` and start them all:
```ts
import { queryEngine } from "../src/classes/QueryEngine";

export const hook = ({ torrents }: PluginInputs): Instruction[] => {
  const query = [
    {
      key: "tracker",
      comparator: "==",
      value: ["aither"]
    }
  ];
  const aitherTorrents = queryEngine.execute(torrents, query, true);
  return aitherTorrents.map(t => { hash: t.hash, then: "start" });
}
```
To see how powerful filters can be, check the default config in the `Actions` plugin.

The QueryEngine is also able to sort torrents. Here we'll sort torrents based on their download progress, but prefer Aither over everything:
```ts
import { queryEngine } from "../src/classes/QueryEngine";

export const hook = ({ torrents }: PluginInputs): Instruction[] => {
  const query = [
    {
      key: "progress",
      comparator: "DESC"
    },
    {
      key: "tracker",
      comparator: "==",
      value: ["aither"]
    }
  ];
  const sortedTorrents = queryEngine.execute(torrents, query, false); // Notice `false` instead of `true`
  // Do something
  return [];
}
```
You can see the `Sort` plugin to see how advanced sort criteria can get.

#### Configurable Queries
If exposing queries to users to configure themselves, you can import `QuerySchema`.
```ts
import { QuerySchema } from "../src/classes/QueryEngine";

export const ConfigSchema = z.object({
  FILTERS: z.array(QuerySchema)
})
```

### Testing
Metadatarr provides a very basic development suite for testing your plugins.

You can edit `./tools/inject.ts` to experiment new hooks, simply turn on `DEV_INJECT` in `core.jsonc` and run Metadatarr like usual. When injection is enabled, the inject tool will be called each cycle and all other hooks will be disabled.

You can also check `./tools/simulate_rename.ts` (and run it directly) to see how I for example would test the `Naming` plugin.

## Contributing
Metadatarr was built to solve real-world problems managing large torrent collections. If you have similar needs or improvements, contributions are welcome!

## TODO:
### Stage 1
#### Docs:
- demo video showcasing features like sorting
- before/after photos of torrent names

### Stage 2
#### Metadata
- Incremental backoff on metadata fetches

#### Move from code to config
- make Naming.formatFlags & Naming.cleanupStringFlags configurable in json

#### Queries:
- Global variables (e.g. system free space)
- Validate config type for enums like state - Right now it accepts any string, but it should only allow valid states
- Time based queries - To allow this action: Delete !noHL if lastActivity > 7d ago && seeders < 5
- Priority tags
- Or / || statements
- Variable support

#### Other:
- Deluge/Transmission/RTorrent support
- recross-seed: auto remove torrents from sonarr/radarr/lidarr/readarr if they have no cross-seeds, so hopefully a new cross-seedable torrent is found
- Web Dashboard
- Hot reload on config change
