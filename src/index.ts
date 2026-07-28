import { Hono } from 'hono'
import authRoutes from './routes/auth.route'

const app = new Hono()



app.get('/', (c) => {
  return c.text('Hello Hono!')
})

app.route('api/v1/auth', authRoutes);



export default app
