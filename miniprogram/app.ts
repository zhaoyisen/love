import { store } from "./core/store";

App({
  globalData: { store },
  onLaunch() {
    store.initialize();
  }
});
