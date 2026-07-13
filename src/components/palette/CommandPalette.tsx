import { Command } from "cmdk";
import { useEnvStore } from "../../state/useEnvStore";
import { useUiStore } from "../../state/useUiStore";
import { useHistoryStore } from "../../state/useHistoryStore";
import { useWorkbenchActions } from "../../state/useWorkbenchActions";
import { useCollectionsStore } from "../../state/useCollectionsStore";
import { useNewRequest } from "../../hooks/useNewRequest";
import {
  buildPaletteActions,
  groupPaletteActions,
  type PaletteAction,
} from "../../lib/paletteActions";
import { PaletteItem } from "./PaletteItem";
import { useT } from "../../i18n/useT";

/** ⌘K command palette — a real command surface. Every row calls the same
 *  store/IPC path the mouse UI uses (via paletteActions + the workbench bus).
 *  cmdk owns fuzzy matching, roving aria-activedescendant, Esc/backdrop close. */
export function CommandPalette() {
  const t = useT();
  const open = useUiStore((state) => state.paletteOpen);
  const closePalette = useUiStore((state) => state.closePalette);
  const toggleTheme = useUiStore((state) => state.toggleTheme);
  const locale = useUiStore((state) => state.locale);
  const setLocale = useUiStore((state) => state.setLocale);
  const openEnvManager = useUiStore((state) => state.openEnvManager);
  const openImport = useUiStore((state) => state.openImport);
  const openHistory = useHistoryStore((state) => state.open);

  const environments = useEnvStore((state) => state.environments);
  const activeEnvironmentId = useEnvStore((state) => state.activeEnvironmentId);
  const switchEnvironment = useEnvStore((state) => state.switchEnvironment);

  const activeRequestPresent = useCollectionsStore(
    (state) => state.activeRequestId != null,
  );
  const newRequest = useNewRequest();

  const bus = useWorkbenchActions();

  const ctx = {
    t,
    locale,
    environments,
    activeEnvironmentId,
    activeRequestPresent,
    dirty: bus.canSave,
    canSend: bus.canSend,
    newRequest,
    saveRequest: () => bus.save?.(),
    sendRequest: () => bus.send?.(),
    copyAsCurl: () => bus.copyCurl?.(),
    switchEnvironment: (id: string) => void switchEnvironment(id),
    openEnvManager,
    openImport,
    openHistory,
    runBenchmark: () => bus.benchmark?.(),
    toggleTheme,
    setLocale,
  };

  const groups = groupPaletteActions(buildPaletteActions(ctx));

  const run = (action: PaletteAction) => {
    if (action.disabled) return;
    action.run();
    closePalette();
  };

  return (
    <Command.Dialog
      open={open}
      onOpenChange={(next) => !next && closePalette()}
      label={t("palette.title")}
      className="lok-palette"
      overlayClassName="lok-palette-overlay"
      contentClassName="lok-palette-content"
    >
      <Command.Input
        placeholder={t("palette.searchPlaceholder")}
        className="lok-mono lok-palette-input"
      />
      <Command.List className="lok-palette-list">
        <Command.Empty className="lok-palette-empty">
          {t("common.noResults")}
        </Command.Empty>

        {groups.map(({ group, actions }) => (
          <Command.Group
            key={group}
            heading={group}
            className="lok-palette-group"
          >
            {actions.map((action) => (
              <PaletteItem
                key={action.id}
                value={action.id}
                label={action.label}
                shortcut={action.shortcut}
                keywords={action.keywords}
                active={action.active}
                disabled={action.disabled}
                onSelect={() => run(action)}
              />
            ))}
          </Command.Group>
        ))}
      </Command.List>
    </Command.Dialog>
  );
}
