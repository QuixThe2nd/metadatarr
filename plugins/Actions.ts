import z from 'zod';
import { QuerySchema, selectorEngine } from "../src/classes/SelectorEngine";
import { TorrentInstructionSchema, type Instruction } from "../src/schemas";
import type { PluginInputs } from '../src/plugins';

const defaultActions: Actions[] = [
  // Resume completed torrents that are stopped
  {
    "if": [{"key": "state", "comparator": "==", "value": ["stoppedUP"]}],
    "then": "start"
  },
      // Force enable sequential downloads on all torrents
  {
    "if": [{"key": "seq_dl", "comparator": "!="}],
    "then": "toggleSequentialDownload"
  },
  // Recheck missing files
  {
    "if": [{"key": "state", "comparator": "==", "value": ["missingFiles"]}],
    "then": "recheck"
  },
  // Delete errored cross-seed-links
  {
    "if": [
      {"key": "category", "comparator": "==", "value": ["cross-seed-links"]},
      {"key": "state", "comparator": "==", "value": ["error"]}
    ],
    "then": "delete",
    "arg": true
  },
  // Resume errored downloads
  {
    "if": [
      {"key": "progress", "comparator": "!=", "value": 1},
      {"key": "state", "comparator": "==", "value": ["error"]}
    ],
    "then": "start",
    "max": 0.01 // 1% chance a single errored download will be restarted each run
  },
  // Delete cross-seed-links that have less than 95% progress
  {
    "if": [
      {"key": "category", "comparator": "==", "value": ["cross-seed-links"]},
      {"key": "progress", "comparator": "<", "value": 0.95},
      {"key": "state", "comparator": "!=", "value": ["checkingDL", "checkingUP", "checkingResumeData", "moving", "stoppedDL"]}
    ],
    "then": "delete",
    "arg": true
  },
  // Force enable auto torrent management mode for non cross-seed torrents
  {
    "if": [
      {"key": "auto_tmm", "comparator": "!="},
      {"key": "tags", "comparator": "!=", "value": ["cross-seed"]}
    ],
    "then": "setAutoManagement",
    "arg": true
  },
  // Remove completed public torrents with ratio >= 2.0
  {
    "if": [
      {"key": "private", "comparator": "!="},
      {"key": "ratio", "comparator": ">=", "value": 2},
      {"key": "progress", "comparator": "==", "value": 1}
    ],
    "then": "delete",
    "arg": true
  },
  // Remove !noHL torrents from public trackers
  {
  	"if": [
  		{"key": "tags", "comparator": "==", "value": ["!noHL"]},
  		{"key": "private", "comparator": "!="}
  	],
  	"then": "delete",
  	"arg": true
  },
  // Remove !noHL torrents from no-HnR trackers
  {
  	"if": [
  		{"key": "tags", "comparator": "==", "value": ["!noHL"]},
  		{"key": "tags", "comparator": "==", "value": ["@MLK", "@FNP", "@RUT", "@FL", "@YNK", "@RFX", "@SP", "@CBR", "@ANT"]}
  	],
  	"then": "delete",
  	"arg": true
  },
  // Remove !noHL torrents from private trackers based on seeding time
  {
  	"if": [
  		{"key": "tags", "comparator": "==", "value": ["!noHL"]},
  		{"key": "tags", "comparator": "==", "value": ["@ULCX", "@HDS", "@SA", "@RAS", "@OE", "@PTF"]},
  		{"key": "seeding_time", "comparator": ">=", "value": 259200} // 3 days
  	],
  	"then": "delete",
  	"arg": true
  },
  {
  	"if": [
  		{"key": "tags", "comparator": "==", "value": ["!noHL"]},
  		{"key": "tags", "comparator": "==", "value": ["@TTi", "@LST", "@DP", "@ST"]},
  		{"key": "seeding_time", "comparator": ">=", "value": 345600} // 4 days
  	],
  	"then": "delete",
  	"arg": true
  },
  {
  	"if": [
  		{"key": "tags", "comparator": "==", "value": ["!noHL"]},
  		{"key": "tags", "comparator": "==", "value": ["@ATH", "@YS", "@DCC", "@RF"]},
  		{"key": "seeding_time", "comparator": ">=", "value": 518400} // 6 days
  	],
  	"then": "delete",
  	"arg": true
  },
  {
  	"if": [
  		{"key": "tags", "comparator": "==", "value": ["!noHL"]},
  		{"key": "tags", "comparator": "==", "value": ["@SHR"]},
  		{"key": "seeding_time", "comparator": ">=", "value": 604800} // 7 days
  	],
  	"then": "delete",
  	"arg": true
  },
  {
  	"if": [
  		{"key": "tags", "comparator": "==", "value": ["!noHL"]},
  		{"key": "tags", "comparator": "==", "value": ["@BLU"]},
  		{"key": "seeding_time", "comparator": ">=", "value": 691200} // 8 days
  	],
  	"then": "delete",
  	"arg": true
  },
  {
  	"if": [
  		{"key": "tags", "comparator": "==", "value": ["!noHL"]},
  		{"key": "tags", "comparator": "==", "value": ["@TL"]},
  		{"key": "seeding_time", "comparator": ">=", "value": 777600} // 9 days
  	],
  	"then": "delete",
  	"arg": true
  },
  {
  	"if": [
  		{"key": "tags", "comparator": "==", "value": ["!noHL"]},
  		{"key": "tags", "comparator": "==", "value": ["@PHD"]},
  		{"key": "seeding_time", "comparator": ">=", "value": 950400} // 11 days
  	],
  	"then": "delete",
  	"arg": true
  },
  {
  	"if": [
  		{"key": "tags", "comparator": "==", "value": ["!noHL"]},
  		{"key": "tags", "comparator": "==", "value": ["@IPT"]},
  		{"key": "seeding_time", "comparator": ">=", "value": 1296000} // 15 days
  	],
  	"then": "delete",
  	"arg": true
  },
  // Default: Remove !noHL torrents after 30 days
  {
  	"if": [
  		{"key": "tags", "comparator": "==", "value": ["!noHL"]},
  		{"key": "seeding_time", "comparator": ">=", "value": 1382400} // 30 days
  	],
  	"then": "delete",
  	"arg": true
  },
  // Recheck stalled but completed downloads
  {
  	"if": [
  		{"key": "state", "comparator": "==", "value": ["stalledDL"]},
  		{"key": "amount_left", "comparator": "==", "value": 0}
  	],
  	"then": "recheck"
  },
  // Tag stalled downloads
  {
  	"if": [{"key": "state", "comparator": "==", "value": ["stalledDL"]}],
  	"then": "addTags",
  	"arg": ["stalledDL"]
  },
  {
  	"if": [{"key": "state", "comparator": "!=", "value": ["stalledDL"]}],
  	"then": "removeTags",
  	"arg": ["stalledDL"]
  },
  // Tag private trackers
  {
  	"if": [{"key": "tracker", "comparator": "==", "value": ["blutopia"]}],
  	"then": "addTags",
  	"arg": ["@BLU", "Private Tracker"]
  },
  {
  	"if": [{"key": "tracker", "comparator": "==", "value": ["seedpool"]}],
  	"then": "addTags",
  	"arg": ["@SP", "Private Tracker"]
  },
  {
  	"if": [{"key": "tracker", "comparator": "==", "value": ["torrentleech"]}],
  	"then": "addTags",
  	"arg": ["@TL", "Private Tracker"]
  },
  {
  	"if": [{"key": "tracker", "comparator": "==", "value": ["tleechreload"]}],
  	"then": "addTags",
  	"arg": ["@TL", "Private Tracker"]
  },
  {
  	"if": [{"key": "tracker", "comparator": "==", "value": ["myanonamouse"]}],
  	"then": "addTags",
  	"arg": ["@MaM", "Private Tracker"]
  },
  {
  	"if": [{"key": "tracker", "comparator": "==", "value": ["digitalcore"]}],
  	"then": "addTags",
  	"arg": ["@DCC", "Private Tracker"]
  },
  {
  	"if": [{"key": "tracker", "comparator": "==", "value": ["stackoverflow.tech"]}],
  	"then": "addTags",
  	"arg": ["@IPT", "Private Tracker"]
  },
  {
  	"if": [{"key": "tracker", "comparator": "==", "value": ["empirehost.me"]}],
  	"then": "addTags",
  	"arg": ["@IPT", "Private Tracker"]
  },
  {
  	"if": [{"key": "tracker", "comparator": "==", "value": ["bgp.technology"]}],
  	"then": "addTags",
  	"arg": ["@IPT", "Private Tracker"]
  },
  {
  	"if": [{"key": "tracker", "comparator": "==", "value": ["shareisland"]}],
  	"then": "addTags",
  	"arg": ["@SHR", "Private Tracker"]
  },
  {
  	"if": [{"key": "tracker", "comparator": "==", "value": ["scenetime"]}],
  	"then": "addTags",
  	"arg": ["@ST", "Private Tracker"]
  },
  {
  	"if": [{"key": "tracker", "comparator": "==", "value": ["darkpeers"]}],
  	"then": "addTags",
  	"arg": ["@DP", "Private Tracker"]
  },
  {
  	"if": [{"key": "tracker", "comparator": "==", "value": ["yu-scene"]}],
  	"then": "addTags",
  	"arg": ["@YS", "Private Tracker"]
  },
  {
  	"if": [{"key": "tracker", "comparator": "==", "value": ["speedapp"]}],
  	"then": "addTags",
  	"arg": ["@SA", "Private Tracker"]
  },
  {
  	"if": [{"key": "tracker", "comparator": "==", "value": ["privatehd"]}],
  	"then": "addTags",
  	"arg": ["@PHD", "Private Tracker"]
  },
  {
  	"if": [{"key": "tracker", "comparator": "==", "value": ["jumbohostpro"]}],
  	"then": "addTags",
  	"arg": ["@TTi", "Private Tracker"]
  },
  {
  	"if": [{"key": "tracker", "comparator": "==", "value": ["connecting.center"]}],
  	"then": "addTags",
  	"arg": ["@TTi", "Private Tracker"]
  },
  {
  	"if": [{"key": "tracker", "comparator": "==", "value": ["sktorrent"]}],
  	"then": "addTags",
  	"arg": ["@SKT", "Private Tracker"]
  },
  {
  	"if": [{"key": "tracker", "comparator": "==", "value": ["ptfiles"]}],
  	"then": "addTags",
  	"arg": ["@PTF", "Private Tracker"]
  },
  {
  	"if": [{"key": "tracker", "comparator": "==", "value": ["milkie"]}],
  	"then": "addTags",
  	"arg": ["@MLK", "Private Tracker"]
  },
  {
  	"if": [{"key": "tracker", "comparator": "==", "value": ["filelist"]}],
  	"then": "addTags",
  	"arg": ["@FL", "Private Tracker"]
  },
  {
  	"if": [{"key": "tracker", "comparator": "==", "value": ["thefl"]}],
  	"then": "addTags",
  	"arg": ["@FL", "Private Tracker"]
  },
  {
  	"if": [{"key": "tracker", "comparator": "==", "value": ["brokenstones"]}],
  	"then": "addTags",
  	"arg": ["@BS", "Private Tracker"]
  },
  {
  	"if": [{"key": "tracker", "comparator": "==", "value": ["fearnopeer"]}],
  	"then": "addTags",
  	"arg": ["@FNP", "Private Tracker"]
  },
  {
  	"if": [{"key": "tracker", "comparator": "==", "value": ["yoinked"]}],
  	"then": "addTags",
  	"arg": ["@YNK", "Private Tracker"]
  },
  {
  	"if": [{"key": "tracker", "comparator": "==", "value": ["hd-space"]}],
  	"then": "addTags",
  	"arg": ["@HDS", "Private Tracker"]
  },
  {
  	"if": [{"key": "tracker", "comparator": "==", "value": ["onlyencodes"]}],
  	"then": "addTags",
  	"arg": ["@OE", "Private Tracker"]
  },
  {
  	"if": [{"key": "tracker", "comparator": "==", "value": ["rastastugan"]}],
  	"then": "addTags",
  	"arg": ["@RAS", "Private Tracker"]
  },
  {
  	"if": [{"key": "tracker", "comparator": "==", "value": ["retroflix"]}],
  	"then": "addTags",
  	"arg": ["@RF", "Private Tracker"]
  },
  {
  	"if": [{"key": "tracker", "comparator": "==", "value": ["upload.cx"]}],
  	"then": "addTags",
  	"arg": ["@ULCX", "Private Tracker"]
  },
  {
  	"if": [{"key": "tracker", "comparator": "==", "value": ["capybarabr"]}],
  	"then": "addTags",
  	"arg": ["@CBR", "Private Tracker"]
  },
  {
  	"if": [{"key": "tracker", "comparator": "==", "value": ["reelflix"]}],
  	"then": "addTags",
  	"arg": ["@RFX", "Private Tracker"]
  },
  {
  	"if": [{"key": "tracker", "comparator": "==", "value": ["lst.gg"]}],
  	"then": "addTags",
  	"arg": ["@LST", "Private Tracker"]
  },
  {
  	"if": [{"key": "tracker", "comparator": "==", "value": ["t-ru.org"]}],
  	"then": "addTags",
  	"arg": ["@RUT", "Private Tracker"]
  },
  {
  	"if": [{"key": "tracker", "comparator": "==", "value": ["blutopia"]}],
  	"then": "addTags",
  	"arg": ["@BLU", "Private Tracker"]
  },
  {
  	"if": [{"key": "tracker", "comparator": "==", "value": ["aither"]}],
  	"then": "addTags",
  	"arg": ["@ATH", "Private Tracker"]
  },
  {
  	"if": [{"key": "tracker", "comparator": "==", "value": ["anthelion"]}],
  	"then": "addTags",
  	"arg": ["@ANT", "Private Tracker"]
  },
  {
  	"if": [{"key": "tags", "comparator": "!=", "value": ["Private Tracker"]}],
  	"then": "addTags",
  	"arg": ["Public Tracker"]
  },
  {
  	"if": [{"key": "tags", "comparator": "==", "value": ["Private Tracker"]}],
  	"then": "removeTags",
  	"arg": ["Public Tracker"]
  }
];

const ActionSchema = z.object({ if: z.array(QuerySchema) }).and(TorrentInstructionSchema).and(z.object({
  max: z.number().optional()
}));
type Actions = z.infer<typeof ActionSchema>;

export const ConfigSchema = z.object({
  ACTIONS: z.array(ActionSchema).default(defaultActions)
});
type Config = z.infer<typeof ConfigSchema>;

const Actions = ({ torrents, config }: PluginInputs<Config>): Instruction[] => {
  torrents = torrents.sort(Math.random);
  const instructions: Instruction[] = [];
  for (const action of config.ACTIONS) {
    if (action.max !== undefined && action.max < 1) action.max = action.max > Math.random() ? 1 : 0;
    let selectedTorrents = torrents;
    for (const selector of action.if) selectedTorrents = selectorEngine.execute(selectedTorrents, selector, true);
    for (const [i, torrent] of selectedTorrents.entries()) {
      if ('max' in action && i === action.max) continue;
      const { if: _, ...rest } = action;
      instructions.push({ hash: torrent.get().hash, ...rest });
    }
  }
  return instructions;
}

export default Actions;
