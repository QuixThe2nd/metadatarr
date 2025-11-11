import fs from 'fs';

export default class LockFile {
  private readonly refreshInterval = 2_500; // Postpone expiry ever 2.5s
  private readonly lifespan = 10_000; // Expire in 10s
  private lastRenew = 0;

  constructor(private readonly path: `${string}.lock`) {
    if (this.isLocked) throw new Error(`${path} is locked`);

    this.renewLock();
    setInterval(() => {
      this.renewLock()
    }, this.refreshInterval);
  }

  get expiry(): number {
    return fs.existsSync(this.path) ? Number(fs.readFileSync(this.path).toString()) : 0;
  }

  get isLocked(): boolean {
    return this.expiry > +new Date();
  }

  renewLock(): void {
    if (this.lastRenew !== this.expiry && this.lastRenew !== 0) throw new Error(`${this.path} lockfile has conflict`);
    this.lastRenew = +new Date() + this.lifespan;
    fs.writeFileSync(this.path, String(this.lastRenew))
  }
}
