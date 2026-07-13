Component({
  data: {
    selected: 0
  },
  methods: {
    switchTab(this: any, event: any) {
      const index = Number(event.currentTarget.dataset.index);
      const page = String(event.currentTarget.dataset.page || "");
      if (!page) return;
      wx.switchTab({ url: page, success: () => this.setData({ selected: index }) });
    },
    compose(this: any) {
      wx.navigateTo({ url: "/pkg-compose/composer/index" });
    }
  }
});
