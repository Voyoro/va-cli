export interface FileUploadResponse {
  data: {
    /**
     * 文件创建时间（Unix 时间戳）
     */
    createTime: number;

    /**
     * 文件下载页面链接
     */
    downloadPage: string;

    /**
     * 文件唯一标识符（UUID）
     */
    id: string;

    /**
     * 文件的 MD5 哈希值
     */
    md5: string;

    /**
     * 文件的 MIME 类型
     */
    mimetype: string;

    /**
     * 文件最后修改时间（Unix 时间戳）
     */
    modTime: number;

    /**
     * 文件名
     */
    name: string;

    /**
     * 父文件夹的唯一标识符（UUID）
     */
    parentFolder: string;

    /**
     * 父文件夹的访问代码
     */
    parentFolderCode: string;

    /**
     * 存储服务器列表
     */
    servers: string[];

    /**
     * 文件大小（字节）
     */
    size: number;

    /**
     * 文件类型（例如 "file"）
     */
    type: string;
  };

  /**
   * 请求状态（例如 "ok" 表示成功）
   */
  status: string;
}
