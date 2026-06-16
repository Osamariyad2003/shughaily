const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api/v1'

interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  meta?: {
    page: number
    limit: number
    total: number
  }
}

class ApiClient {
  private baseUrl: string
  private token: string | null = null

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl
    this.token = localStorage.getItem('token')
  }

  setToken(token: string | null) {
    this.token = token
    if (token) {
      localStorage.setItem('token', token)
    } else {
      localStorage.removeItem('token')
    }
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    isFormData = false
  ): Promise<ApiResponse<T>> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
    }

    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`
    }

    if (!isFormData) {
      headers['Content-Type'] = 'application/json'
    }

    const config: RequestInit = {
      method,
      headers,
    }

    if (body) {
      config.body = isFormData ? (body as FormData) : JSON.stringify(body)
    }

    const response = await fetch(`${this.baseUrl}${path}`, config)
    const raw = await response.text()

    let data: ApiResponse<T> | null = null
    if (raw) {
      try {
        data = JSON.parse(raw) as ApiResponse<T>
      } catch {
        data = null
      }
    }

    if (!response.ok) {
      const fallbackMessage =
        raw && !raw.trim().startsWith('<')
          ? raw
          : response.statusText || 'حدث خطأ غير متوقع'

      throw new Error(data?.error || fallbackMessage)
    }

    if (data) {
      return data
    }

    return { success: true }
  }

  get<T>(path: string) {
    return this.request<T>('GET', path)
  }

  post<T>(path: string, body?: unknown) {
    return this.request<T>('POST', path, body)
  }

  put<T>(path: string, body?: unknown) {
    return this.request<T>('PUT', path, body)
  }

  patch<T>(path: string, body?: unknown) {
    return this.request<T>('PATCH', path, body)
  }

  delete<T>(path: string) {
    return this.request<T>('DELETE', path)
  }

  upload<T>(path: string, formData: FormData) {
    return this.request<T>('POST', path, formData, true)
  }
}

export const api = new ApiClient(API_BASE)
export type { ApiResponse }
