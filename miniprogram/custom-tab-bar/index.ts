Component({
  data: {
    selected: 0,
    tabs: [
      { page: "/pages-main/time/index", label: "时光", icon: "time" },
      { page: "/pages-main/couple/index", label: "我们", icon: "couple" }
    ]
  },
  methods: {
    switchTab(this: any, event: any) {
      const index = Number(event.currentTarget.dataset.index);
      const tab = this.data.tabs[index];
      this.setData({ selected: index });
      wx.switchTab({ url: tab.page });
    },
    compose(this: any) {
      wx.navigateTo({ url: "/pkg-compose/composer/index" });
    }
  }
});
