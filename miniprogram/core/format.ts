export function splitDate(iso: string) {
  const date = new Date(iso);
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hour = `${date.getHours()}`.padStart(2, "0");
  const minute = `${date.getMinutes()}`.padStart(2, "0");
  return { date: `${month}月${day}日`, time: `${hour}:${minute}`, day: date.getDate(), month: date.getMonth() + 1 };
}

export function visibleLabel(value: string) {
  return value === "SHARED" ? "与另一半共同可见" : "仅自己可见";
}

export function decorateMoment(item: any) {
  return {
    ...item,
    ...splitDate(item.occurredAt),
    cover: item.media[0] || { tone: "paper", path: "" },
    reactionValue: item.reaction ? item.reaction.value : "",
    visibilityLabel: visibleLabel(item.visibility),
    commentCount: item.comments.length
  };
}
