export class BaseSocialCollector {
  constructor(platform){ this.platform=platform; }
  async discover(){ throw new Error(`${this.platform} discover()가 구현되지 않았습니다.`); }
  async getPost(){ throw new Error(`${this.platform} getPost()가 구현되지 않았습니다.`); }
  async getMedia(){ throw new Error(`${this.platform} getMedia()가 구현되지 않았습니다.`); }
  async getMetrics(){ throw new Error(`${this.platform} getMetrics()가 구현되지 않았습니다.`); }
}
