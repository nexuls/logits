import { DataModule, type ModuleScope } from "@/data/dataModule";
import { appRecordId, appRecordSchema, type AppRecord } from "./schema";
import {
  createInitialUserSettings,
  normalizeUserSettings,
  type UserSettings,
} from "./settings";

function nowIso() {
  return new Date().toISOString();
}

export class AppModule extends DataModule<AppRecord> {
  constructor(getDb: () => Promise<import("@/data/dataModule").DbLike>) {
    super("appPreferences", appRecordSchema, getDb);
  }

  async getRecord(scope?: ModuleScope) {
    const current = await this.readSettingsRecord(scope);

    if (current) return current;

    const timestamp = nowIso();
    return this.saveRecord(
      {
        id: appRecordId,
        settings: createInitialUserSettings(),
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      scope,
    );
  }

  async getSettings(scope?: ModuleScope) {
    const record = await this.getRecord(scope);
    return normalizeUserSettings(record.settings);
  }

  async setSettings(nextSettings: UserSettings, scope?: ModuleScope) {
    const record = await this.getRecord(scope);

    return this.saveRecord(
      {
        ...record,
        settings: normalizeUserSettings(nextSettings),
        updatedAt: nowIso(),
      },
      scope,
    );
  }

  async updateSettings(
    updater: (currentSettings: UserSettings) => Partial<UserSettings>,
    scope?: ModuleScope,
  ) {
    const current = await this.getSettings(scope);
    const patch = updater(current);

    return this.setSettings(
      normalizeUserSettings({
        ...current,
        ...patch,
        appearance: {
          ...current.appearance,
          ...patch.appearance,
        },
      }),
      scope,
    );
  }

  private async readSettingsRecord(scope?: ModuleScope) {
    return super.readRecord(appRecordId, scope);
  }
}
