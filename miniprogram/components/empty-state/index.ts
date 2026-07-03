Component({ properties: { title: String, description: String, action: String }, methods: { action(this: any) { this.triggerEvent("action"); } } });
