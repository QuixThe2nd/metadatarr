import type { TorrentInstruction } from "./schemas"

export type Instruction = (TorrentInstruction & { hash: string }) | {
  then: 'setMaxActiveDownloads'
  arg: number
} | {
  then: 'topPriority'
  arg: string[]
} | {
  then: 'renameFile',
  arg: [string, string],
  hash: string
}
