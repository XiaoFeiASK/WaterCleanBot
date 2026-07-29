const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '';

export async function fetchRobotLocation(robotCode, signal) {
  const response = await fetch(
    `${apiBaseUrl}/api/robots/${encodeURIComponent(robotCode)}/location`,
    { signal },
  );

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('没有找到该机器人位置');
    }
    throw new Error(`位置接口请求失败（${response.status}）`);
  }

  return response.json();
}
