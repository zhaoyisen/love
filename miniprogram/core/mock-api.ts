import { store } from "./store";

function wait(ms = 280) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export const mockApi = {
  async login() { await wait(); store.login(); return store.getState().profile; },
  async acceptInvitation() { await wait(500); store.pair(); return store.getState().couple; },
  async publish(draftId: string) { await wait(650); return store.publishDraft(draftId); },
  async unbind() { await wait(650); store.unpair(); },
  async generateRecap() { await wait(900); store.finishRecap(); return store.getState().recap; }
};
