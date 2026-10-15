// 近岸参考线按参考分段连接；导航分段表示可航行性，不用于参考线展示。
export function getNearBankReferenceSections(data) {
  const sections = [];
  for (const route of data.routes) {
    let section = null;
    let previousReferenceSegmentId;
    for (const point of route.points) {
      if (!section || point.reference_can_connect_previous === false
        || point.reference_segment_id !== previousReferenceSegmentId) {
        section = {
          id: `near-bank-${route.bank_name}-${sections.length + 1}`,
          side: route.side,
          kind: 'near-bank-reference',
          points: [],
        };
        sections.push(section);
      }
      section.points.push([point.longitude_deg, point.latitude_deg]);
      previousReferenceSegmentId = point.reference_segment_id;
    }
  }
  return sections;
}
