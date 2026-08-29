import type { LoaderFunctionArgs } from "react-router";
import { redirect, Form, useLoaderData } from "react-router";
import { login } from "../../shopify.server";
import styles from "./styles.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  if (url.searchParams.get("shop")) throw redirect(`/app?${url.searchParams.toString()}`);
  return { showForm: Boolean(login) };
};

export default function Index() {
  const { showForm } = useLoaderData<typeof loader>();
  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <img className={styles.logo} src="/adshield-ai-logo.jpg" alt="AdShield AI" />
        <h1 className={styles.heading}>Catch risky marketing claims before they become expensive.</h1>
        <p className={styles.text}>AdShield AI scans Shopify product copy for advertising-compliance risk and gives merchants a prioritized review list.</p>
        {showForm && (
          <Form className={styles.form} method="post" action="/auth/login">
            <label className={styles.label}>
              <span>Shop domain</span>
              <input className={styles.input} type="text" name="shop" placeholder="store.myshopify.com" />
            </label>
            <button className={styles.button} type="submit">Install / log in</button>
          </Form>
        )}
        <ul className={styles.list}>
          <li><strong>Scan.</strong> Review product titles, descriptions and SEO copy.</li>
          <li><strong>Prioritize.</strong> Sort findings by critical, high, medium and low risk.</li>
          <li><strong>Fix smarter.</strong> See the exact phrase, why it matters and a safer next action.</li>
        </ul>
      </div>
    </div>
  );
}
