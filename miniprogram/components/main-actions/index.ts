Component({
  properties: {
    unread: { type: Number, value: 0 },
    showPet: { type: Boolean, value: false }
  },
  methods: {
    messages() { wx.navigateTo({ url: "/pkg-couple/messages/index" }); },
    pet(this: any) { if (this.data.showPet) wx.navigateTo({ url: "/pkg-pet/detail/index" }); }
  }
});
