import { Hono } from 'hono'
import authRoutes from './routes/auth.route'
import { logger } from './utils/logger' 
import {logger as honoLogger} from 'hono/logger'

const app = new Hono().basePath('/api/v1')

app.use("*", honoLogger())
app.get('/', (c) => {
  return c.text('Hello Hono!')
})

app.route('/auth', authRoutes)

export default app
