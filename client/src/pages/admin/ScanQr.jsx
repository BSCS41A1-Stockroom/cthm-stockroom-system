"use strict";

import { useRef, useState } from "react";
import { authenticatedFetch } from "../../lib/api";

export default function ScanQr() {
  const [scanValue, setScanValue] = useState("");
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [mode, setMode] = useState("claim");
  const [returnRequest, setReturnRequest] = useState(null);
  const [returnForm, setReturnForm] = useState(null);

  const [assetScanValue, setAssetScanValue] = useState("");
  const [returnAssets, setReturnAssets] = useState([]);
  const [missingAssets, setMissingAssets] = useState([]);

  const scanLock = useRef(false);

  /*
   * ------------------------------------------------------------
   * SELECT RETURN REQUEST
   * ------------------------------------------------------------
   */

  function selectReturnRequest(request) {
    setReturnAssets([]);
    setMissingAssets([]);

    if (!request) {
      setReturnRequest(null);
      setReturnForm(null);
      return;
    }

    setReturnRequest(request);

    setReturnForm({
      idempotencyKey: crypto.randomUUID(),
      remarks: "",
      items: (request.items || []).map((item) => ({
        inventoryId: item.inventoryId,
        name: item.name,
        trackingType: item.trackingType,
        outstandingQuantity: Number(item.outstandingQuantity || 0),
        goodQuantity: 0,
        damagedQuantity: 0,
        missingQuantity: 0,
        conditionNote: "",
      })),
    });
  }

  /*
   * ------------------------------------------------------------
   * NORMAL QR LOOKUP
   * ------------------------------------------------------------
   */

  async function lookup(token) {
    const normalized = String(token ?? "").trim();

    if (!normalized || scanLock.current) {
      return;
    }

    if (normalized.startsWith("cthmasset.") && result) {
      if (result.mode === "return") {
        return lookupReturnAsset(normalized);
      }

      return lookupAsset(normalized);
    }

    scanLock.current = true;
    setBusy(true);
    setMessage("");
    setResult(null);
    setReturnRequest(null);
    setReturnForm(null);
    setReturnAssets([]);
    setMissingAssets([]);

    try {
      const response = await authenticatedFetch("/api/qr/lookup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token: normalized,
          mode,
        }),
      });

      const body = await response.json();

      if (!response.ok) {
        throw new Error(
          body.message || "Unable to read this account QR."
        );
      }

      setResult(body);
      setScanValue("");

      /*
       * If exactly one borrowing request is returned,
       * automatically open it.
       */
      if (
        body.mode === "return" &&
        Array.isArray(body.requests) &&
        body.requests.length === 1
      ) {
        selectReturnRequest(body.requests[0]);
      }

      /*
       * Stop camera if the component has one.
       * This is intentionally guarded because some versions
       * of the component may not have a camera function.
       */
      if (typeof stopCamera === "function") {
        await stopCamera();
      }
    } catch (error) {
      setMessage(
        error?.message || "Unable to read this QR code."
      );
    } finally {
      scanLock.current = false;
      setBusy(false);
    }
  }

  /*
   * ------------------------------------------------------------
   * ASSET LOOKUP
   * ------------------------------------------------------------
   */

  async function lookupAsset(token) {
    const normalized = String(token ?? "").trim();

    if (!normalized || scanLock.current) {
      return;
    }

    scanLock.current = true;
    setBusy(true);
    setMessage("");

    try {
      const response = await authenticatedFetch(
        "/api/qr/assets/lookup",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            token: normalized,
          }),
        }
      );

      const body = await response.json();

      if (!response.ok) {
        throw new Error(
          body.message || "Unable to read this asset QR."
        );
      }

      setMessage(
        `${body.asset.assetNumber || "Asset"} added.`
      );
    } catch (error) {
      setMessage(
        error?.message || "Unable to read this asset QR."
      );
    } finally {
      scanLock.current = false;
      setBusy(false);
    }
  }

  /*
   * ------------------------------------------------------------
   * RETURN ASSET LOOKUP
   * ------------------------------------------------------------
   */

  async function lookupReturnAsset(token) {
    const normalized = String(token ?? "").trim();

    if (!normalized || scanLock.current || !returnRequest) {
      return;
    }

    scanLock.current = true;
    setBusy(true);
    setMessage("");

    try {
      const response = await authenticatedFetch(
        "/api/qr/assets/lookup",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            token: normalized,
          }),
        }
      );

      const body = await response.json();

      if (!response.ok) {
        throw new Error(
          body.message || "Unable to read this asset QR."
        );
      }

      if (!body.asset) {
        throw new Error(
          "The asset QR response did not contain an asset."
        );
      }

      const requested = (returnRequest.items || []).find(
        (item) =>
          String(item.inventoryId) ===
            String(body.asset.inventoryId) &&
          item.trackingType === "serialized"
      );

      if (!requested) {
        throw new Error(
          `${body.asset.assetNumber} is not a serialized item in this return.`
        );
      }

      if (
        returnAssets.some(
          (entry) =>
            String(entry.asset.id) ===
            String(body.asset.id)
        )
      ) {
        throw new Error(
          `${body.asset.assetNumber} was already scanned.`
        );
      }

      if (
        missingAssets.some(
          (entry) =>
            String(entry.assetId) ===
            String(body.asset.id)
        )
      ) {
        throw new Error(
          `${body.asset.assetNumber} is currently marked as missing. Undo that report before scanning it as returned.`
        );
      }

      const count =
        returnAssets.filter(
          (entry) =>
            String(entry.asset.inventoryId) ===
            String(requested.inventoryId)
        ).length +
        missingAssets.filter(
          (entry) =>
            String(entry.inventoryId) ===
            String(requested.inventoryId)
        ).length;

      if (
        count >= Number(requested.outstandingQuantity)
      ) {
        throw new Error(
          `All outstanding units of ${requested.name} are already scanned.`
        );
      }

      setReturnAssets((current) => [
        ...current,
        {
          token: normalized,
          asset: body.asset,
          condition: "good",
          conditionNote: "",
        },
      ]);

      setAssetScanValue("");

      setMessage(
        `${body.asset.assetNumber} added to the return.`
      );
    } catch (error) {
      setMessage(
        error?.message ||
          "Unable to read this asset QR."
      );
    } finally {
      scanLock.current = false;
      setBusy(false);
    }
  }

  /*
   * ------------------------------------------------------------
   * REPORT SERIALIZED ASSET AS MISSING
   * ------------------------------------------------------------
   */

  function reportMissing(asset, inventoryId) {
    if (!asset) {
      return;
    }

    const alreadyMissing = missingAssets.some(
      (entry) =>
        String(entry.assetId) ===
        String(asset.id)
    );

    const alreadyReturned = returnAssets.some(
      (entry) =>
        String(entry.asset.id) ===
        String(asset.id)
    );

    if (alreadyMissing || alreadyReturned) {
      return;
    }

    setMissingAssets((current) => [
      ...current,
      {
        assetId: asset.id,
        assetNumber: asset.assetNumber,
        inventoryId,
        reason: "",
      },
    ]);

    setMessage(
      `${asset.assetNumber} marked as missing.`
    );
  }

  /*
   * ------------------------------------------------------------
   * UPDATE MISSING-ASSET REASON
   * ------------------------------------------------------------
   */

  function updateMissingReason(assetId, reason) {
    setMissingAssets((current) =>
      current.map((entry) =>
        String(entry.assetId) ===
        String(assetId)
          ? {
              ...entry,
              reason,
            }
          : entry
      )
    );
  }

  /*
   * ------------------------------------------------------------
   * REMOVE RETURNED ASSET
   * ------------------------------------------------------------
   */

  function removeReturnAsset(assetId) {
    setReturnAssets((current) =>
      current.filter(
        (entry) =>
          String(entry.asset.id) !==
          String(assetId)
      )
    );
  }

  /*
   * ------------------------------------------------------------
   * SUBMIT RETURN
   *
   * IMPORTANT:
   * We intentionally do NOT rely on native HTML required/minLength
   * validation for serialized asset condition notes.
   *
   * This guarantees submitReturn() actually runs and allows the
   * application to display its own validation message.
   * ------------------------------------------------------------
   */

  async function submitReturn(event) {
    event.preventDefault();

    /*
     * Stop immediately if no request/form exists.
     */
    if (!returnRequest || !returnForm) {
      setMessage(
        "Select a borrowing request before recording the return."
      );
      return;
    }

    /*
     * Prevent double submission.
     */
    if (scanLock.current) {
      return;
    }

    /*
     * ----------------------------------------------------------
     * VALIDATE NORMAL ITEM QUANTITIES
     * ----------------------------------------------------------
     */

    const exceeded = returnForm.items.find(
      (item) =>
        Number(item.goodQuantity || 0) +
          Number(item.damagedQuantity || 0) +
          Number(item.missingQuantity || 0) >
        Number(item.outstandingQuantity || 0)
    );

    if (exceeded) {
      setMessage(
        `Entered quantities exceed the outstanding units for ${exceeded.name}.`
      );
      return;
    }

    /*
     * ----------------------------------------------------------
     * VALIDATE NORMAL ITEM CONDITION NOTES
     * ----------------------------------------------------------
     */

    const missingNote = returnForm.items.find(
      (item) =>
        (Number(item.damagedQuantity || 0) > 0 ||
          Number(item.missingQuantity || 0) > 0) &&
        String(item.conditionNote || "").trim()
          .length < 5
    );

    if (missingNote) {
      setMessage(
        `Add a condition note of at least 5 characters for damaged or missing units of ${missingNote.name}.`
      );
      return;
    }

    /*
     * ----------------------------------------------------------
     * VALIDATE SERIALIZED DAMAGED ASSET NOTES
     *
     * This was missing from the previous validation.
     * ----------------------------------------------------------
     */

    const damagedSerializedAsset =
      returnAssets.find(
        (entry) =>
          entry.condition === "damaged" &&
          String(entry.conditionNote || "")
            .trim()
            .length < 5
      );

    if (damagedSerializedAsset) {
      setMessage(
        `Add a condition note of at least 5 characters for damaged asset ${damagedSerializedAsset.asset.assetNumber}.`
      );
      return;
    }

    /*
     * ----------------------------------------------------------
     * VALIDATE MISSING SERIALIZED ASSET REASONS
     * ----------------------------------------------------------
     */

    const invalidMissingAsset =
      missingAssets.find(
        (entry) =>
          String(entry.reason || "")
            .trim()
            .length < 5
      );

    if (invalidMissingAsset) {
      setMessage(
        `Add a missing-asset reason of at least 5 characters for ${invalidMissingAsset.assetNumber}.`
      );
      return;
    }

    /*
     * ----------------------------------------------------------
     * ACCOUNTING CHECK
     *
     * For normal items:
     *   good + damaged + missing
     *
     * For serialized items:
     *   scanned returned assets + reported missing assets
     * ----------------------------------------------------------
     */

    const normalAccounted = returnForm.items.reduce(
      (sum, item) => {
        const isSerialized =
          returnRequest.items.find(
            (entry) =>
              String(entry.inventoryId) ===
              String(item.inventoryId)
          )?.trackingType === "serialized";

        /*
         * Serialized quantities are generated from the
         * scanned assets below, so do not double-count them.
         */
        if (isSerialized) {
          return sum;
        }

        return (
          sum +
          Number(item.goodQuantity || 0) +
          Number(item.damagedQuantity || 0) +
          Number(item.missingQuantity || 0)
        );
      },
      0
    );

    const serializedAccounted =
      returnAssets.length +
      missingAssets.length;

    const accounted =
      normalAccounted + serializedAccounted;

    if (accounted <= 0) {
      setMessage(
        "Enter at least one returned, damaged, or missing unit."
      );
      return;
    }

    /*
     * ----------------------------------------------------------
     * LOCK SUBMISSION
     * ----------------------------------------------------------
     */

    scanLock.current = true;
    setBusy(true);
    setMessage("");

    try {
      /*
       * --------------------------------------------------------
       * BUILD SERIALIZED COUNTS
       * --------------------------------------------------------
       */

      const serializedCounts = new Map();

      for (const asset of returnAssets) {
        const key = String(
          asset.asset.inventoryId
        );

        const counts =
          serializedCounts.get(key) || {
            good: 0,
            damaged: 0,
            missing: 0,
          };

        if (asset.condition === "damaged") {
          counts.damaged += 1;
        } else {
          counts.good += 1;
        }

        serializedCounts.set(key, counts);
      }

      for (const asset of missingAssets) {
        const key = String(
          asset.inventoryId
        );

        const counts =
          serializedCounts.get(key) || {
            good: 0,
            damaged: 0,
            missing: 0,
          };

        counts.missing =
          (counts.missing || 0) + 1;

        serializedCounts.set(
          key,
          counts
        );
      }

      /*
       * --------------------------------------------------------
       * BUILD SUBMISSION
       * --------------------------------------------------------
       */

      const submission = {
        ...returnForm,

        items: returnForm.items.map(
          (item) => {
            const requested =
              returnRequest.items.find(
                (entry) =>
                  String(entry.inventoryId) ===
                  String(item.inventoryId)
              );

            /*
             * Non-serialized item:
             * use the manually entered quantities.
             */
            if (
              requested?.trackingType !==
              "serialized"
            ) {
              return {
                ...item,
                goodQuantity: Number(
                  item.goodQuantity || 0
                ),
                damagedQuantity: Number(
                  item.damagedQuantity || 0
                ),
                missingQuantity: Number(
                  item.missingQuantity || 0
                ),
              };
            }

            /*
             * Serialized item:
             * quantities come from scanned assets.
             */
            const counts =
              serializedCounts.get(
                String(item.inventoryId)
              ) || {
                good: 0,
                damaged: 0,
                missing: 0,
              };

            return {
              ...item,
              goodQuantity:
                counts.good || 0,
              damagedQuantity:
                counts.damaged || 0,
              missingQuantity:
                counts.missing || 0,
              conditionNote:
                counts.damaged ||
                counts.missing
                  ? "See individual serialized asset incident/condition notes."
                  : "",
            };
          }
        ),

        /*
         * Serialized assets actually scanned.
         */
        assets: returnAssets.map(
          ({
            token,
            condition,
            conditionNote,
          }) => ({
            token,
            condition,
            conditionNote:
              conditionNote || "",
          })
        ),

        /*
         * Serialized assets reported missing.
         */
        missingAssets:
          missingAssets.map(
            ({
              assetId,
              reason,
            }) => ({
              assetId,
              reason:
                String(reason || "").trim(),
            })
          ),
      };

      /*
       * --------------------------------------------------------
       * DEBUG INFORMATION
       *
       * These are visible in the browser console if needed,
       * but do not affect the request.
       * --------------------------------------------------------
       */

      console.log(
        "[QR RETURN] Submitting return:",
        {
          requestId: returnRequest.id,
          submission,
        }
      );

      /*
       * --------------------------------------------------------
       * ACTUAL RETURN REQUEST
       *
       * This is the important request that was missing from the
       * Vercel runtime logs.
       * --------------------------------------------------------
       */

      const response =
        await authenticatedFetch(
          `/api/borrowings/${returnRequest.id}/returns`,
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify(
              submission
            ),
          }
        );

      /*
       * Some error responses may not contain valid JSON.
       */
      let body = {};

      try {
        body =
          await response.json();
      } catch {
        body = {};
      }

      console.log(
        "[QR RETURN] Response:",
        response.status,
        body
      );

      if (!response.ok) {
        throw new Error(
          body.reasons?.[0] ||
            body.message ||
            `Unable to record the return. Server returned ${response.status}.`
        );
      }

      /*
       * --------------------------------------------------------
       * SUCCESS
       * --------------------------------------------------------
       */

      setResult(null);
      setReturnRequest(null);
      setReturnForm(null);
      setReturnAssets([]);
      setMissingAssets([]);
      setAssetScanValue("");

      setMessage(
        body.complete
          ? "Return completed. All items are accounted for."
          : "Partial return recorded. Outstanding items remain."
      );
    } catch (error) {
      console.error(
        "[QR RETURN] Submission failed:",
        error
      );

      setMessage(
        error?.message ||
          "Unable to record the return."
      );
    } finally {
      scanLock.current = false;
      setBusy(false);
    }
  }

  /*
   * ------------------------------------------------------------
   * CAMERA PLACEHOLDER
   *
   * If your existing component already has a real stopCamera()
   * implementation, keep that implementation instead.
   * ------------------------------------------------------------
   */

  async function stopCamera() {
    return;
  }

  /*
   * ------------------------------------------------------------
   * RETURN FORM ITEM UPDATE
   * ------------------------------------------------------------
   */

  function updateReturnItem(
    index,
    field,
    value
  ) {
    setReturnForm((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        items: current.items.map(
          (entry, itemIndex) =>
            itemIndex === index
              ? {
                  ...entry,
                  [field]: value,
                }
              : entry
        ),
      };
    });
  }

  /*
   * ------------------------------------------------------------
   * RENDER
   * ------------------------------------------------------------
   */

  return (
    <div className="scan-qr-page">
      <div className="scan-qr-container">

        {/* -------------------------------------------------- */}
        {/* HEADER */}
        {/* -------------------------------------------------- */}

        <div className="scan-qr-header">
          <div>
            <h1>QR Scanner</h1>
            <p>
              Scan a QR code to process an account,
              borrowing request, or returned asset.
            </p>
          </div>

          <div className="scan-mode-selector">
            <button
              type="button"
              className={
                mode === "claim"
                  ? "active"
                  : ""
              }
              onClick={() => {
                setMode("claim");
                setResult(null);
                setReturnRequest(null);
                setReturnForm(null);
                setMessage("");
              }}
            >
              Claim
            </button>

            <button
              type="button"
              className={
                mode === "return"
                  ? "active"
                  : ""
              }
              onClick={() => {
                setMode("return");
                setResult(null);
                setReturnRequest(null);
                setReturnForm(null);
                setMessage("");
              }}
            >
              Return
            </button>
          </div>
        </div>

        {/* -------------------------------------------------- */}
        {/* MANUAL QR INPUT */}
        {/* -------------------------------------------------- */}

        <div className="scan-input-panel">
          <input
            type="text"
            value={scanValue}
            onChange={(event) =>
              setScanValue(event.target.value)
            }
            onKeyDown={(event) => {
              if (
                event.key === "Enter"
              ) {
                event.preventDefault();
                lookup(scanValue);
              }
            }}
            placeholder="Scan or enter QR token"
            disabled={busy}
          />

          <button
            type="button"
            onClick={() =>
              lookup(scanValue)
            }
            disabled={
              busy ||
              !scanValue.trim()
            }
          >
            {busy
              ? "Processing..."
              : "Scan"}
          </button>
        </div>

        {/* -------------------------------------------------- */}
        {/* MESSAGE */}
        {/* -------------------------------------------------- */}

        {message && (
          <div
            className="scan-message"
            role="alert"
          >
            {message}
          </div>
        )}

        {/* -------------------------------------------------- */}
        {/* NORMAL RESULT */}
        {/* -------------------------------------------------- */}

        {result &&
          result.mode !== "return" && (
            <section className="transaction-result">
              <h2>
                {result.title ||
                  "QR Result"}
              </h2>

              <pre>
                {JSON.stringify(
                  result,
                  null,
                  2
                )}
              </pre>
            </section>
          )}

        {/* -------------------------------------------------- */}
        {/* RETURN RESULT */}
        {/* -------------------------------------------------- */}

        {result?.mode === "return" && (
          <div className="transaction-result-overlay">
            <section className="transaction-result-panel">

              <div className="return-header">
                <div>
                  <h2>
                    Process Return
                  </h2>

                  <p>
                    Select the borrowing
                    request and account
                    for all returned items.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setResult(null);
                    setReturnRequest(null);
                    setReturnForm(null);
                    setReturnAssets([]);
                    setMissingAssets([]);
                    setMessage("");
                  }}
                >
                  Close
                </button>
              </div>

              {/* ------------------------------------------------ */}
              {/* REQUEST PICKER */}
              {/* ------------------------------------------------ */}

              {Array.isArray(
                result.requests
              ) &&
                result.requests.length >
                  1 && (
                  <fieldset className="return-request-picker">
                    <legend>
                      Select Borrowing
                      Request
                    </legend>

                    {result.requests.map(
                      (request) => {
                        const selected =
                          String(
                            returnRequest?.id
                          ) ===
                          String(
                            request.id
                          );

                        return (
                          <button
                            type="button"
                            className={
                              selected
                                ? "selected"
                                : ""
                            }
                            aria-pressed={
                              selected
                            }
                            key={
                              request.id
                            }
                            onClick={() =>
                              selectReturnRequest(
                                request
                              )
                            }
                          >
                            <strong>
                              {request.requestCode ||
                                `Request #${request.id}`}
                            </strong>

                            <span>
                              {request.status ||
                                "Borrowed"}
                            </span>
                          </button>
                        );
                      }
                    )}
                  </fieldset>
                )}

              {/* ------------------------------------------------ */}
              {/* RETURN FORM */}
              {/* ------------------------------------------------ */}

              {returnRequest &&
                returnForm && (
                  <form
                    className="qr-return-form"
                    onSubmit={
                      submitReturn
                    }
                    noValidate
                  >
                    {/* ------------------------------------------ */}
                    {/* SUMMARY */}
                    {/* ------------------------------------------ */}

                    <div className="return-summary">
                      <div>
                        <span>
                          Request
                        </span>
                        <strong>
                          {returnRequest.requestCode ||
                            `#${returnRequest.id}`}
                        </strong>
                      </div>

                      <div>
                        <span>
                          Borrower
                        </span>
                        <strong>
                          {returnRequest.borrowerName ||
                            returnRequest.borrower?.fullName ||
                            "Borrower"}
                        </strong>
                      </div>

                      <div>
                        <span>
                          Status
                        </span>
                        <strong>
                          {returnRequest.status ||
                            "Borrowed"}
                        </strong>
                      </div>
                    </div>

                    {/* ------------------------------------------ */}
                    {/* SERIALIZED ASSET SCANNER */}
                    {/* ------------------------------------------ */}

                    {returnRequest.items?.some(
                      (item) =>
                        item.trackingType ===
                        "serialized"
                    ) && (
                      <div className="serialized-scan-panel">
                        <h3>
                          Scan Returned
                          Assets
                        </h3>

                        <div className="serialized-return-input">
                          <input
                            type="text"
                            value={
                              assetScanValue
                            }
                            onChange={(
                              event
                            ) =>
                              setAssetScanValue(
                                event.target
                                  .value
                              )
                            }
                            onKeyDown={(
                              event
                            ) => {
                              if (
                                event.key ===
                                "Enter"
                              ) {
                                event.preventDefault();

                                lookupReturnAsset(
                                  assetScanValue
                                );
                              }
                            }}
                            placeholder="Scan an asset QR"
                            disabled={busy}
                          />

                          <button
                            type="button"
                            onClick={() =>
                              lookupReturnAsset(
                                assetScanValue
                              )
                            }
                            disabled={
                              busy ||
                              !assetScanValue.trim()
                            }
                          >
                            Add Asset
                          </button>
                        </div>

                        {returnAssets.map(
                          (
                            entry,
                            assetIndex
                          ) => (
                            <div
                              className="serialized-return-row"
                              key={
                                entry.asset
                                  .id
                              }
                            >
                              <strong>
                                {
                                  entry
                                    .asset
                                    .assetNumber
                                }
                              </strong>

                              <select
                                value={
                                  entry.condition
                                }
                                onChange={(
                                  event
                                ) =>
                                  setReturnAssets(
                                    (
                                      current
                                    ) =>
                                      current.map(
                                        (
                                          value,
                                          index
                                        ) =>
                                          index ===
                                          assetIndex
                                            ? {
                                                ...value,
                                                condition:
                                                  event
                                                    .target
                                                    .value,
                                              }
                                            : value
                                      )
                                  )
                                }
                                disabled={
                                  busy
                                }
                              >
                                <option value="good">
                                  Good
                                </option>

                                <option value="fair">
                                  Fair
                                </option>

                                <option value="damaged">
                                  Damaged
                                </option>
                              </select>

                              {entry.condition ===
                                "damaged" && (
                                <input
                                  type="text"
                                  minLength="5"
                                  maxLength="500"
                                  value={
                                    entry.conditionNote
                                  }
                                  placeholder="Damage details (at least 5 characters)"
                                  onChange={(
                                    event
                                  ) =>
                                    setReturnAssets(
                                      (
                                        current
                                      ) =>
                                        current.map(
                                          (
                                            value,
                                            index
                                          ) =>
                                            index ===
                                            assetIndex
                                              ? {
                                                  ...value,
                                                  conditionNote:
                                                    event
                                                      .target
                                                      .value,
                                                }
                                              : value
                                        )
                                    )
                                  }
                                />
                              )}

                              <button
                                type="button"
                                onClick={() =>
                                  removeReturnAsset(
                                    entry
                                      .asset
                                      .id
                                  )
                                }
                              >
                                Remove
                              </button>
                            </div>
                          )
                        )}
                      </div>
                    )}

                    {/* ------------------------------------------ */}
                    {/* MISSING SERIALIZED ASSETS */}
                    {/* ------------------------------------------ */}

                    {returnRequest.items
                      ?.filter(
                        (item) =>
                          item.trackingType ===
                          "serialized"
                      )
                      .map((item) => (
                        <div
                          className="missing-asset-panel"
                          key={`missing-${item.inventoryId}`}
                        >
                          <h4>
                            {
                              item.name
                            }{" "}
                            assigned
                            assets
                          </h4>

                          {(item.assets ||
                            []).map(
                            (asset) => {
                              const returned =
                                returnAssets.some(
                                  (
                                    entry
                                  ) =>
                                    String(
                                      entry
                                        .asset
                                        .id
                                    ) ===
                                    String(
                                      asset.id
                                    )
                                );

                              const missing =
                                missingAssets.find(
                                  (
                                    entry
                                  ) =>
                                    String(
                                      entry.assetId
                                    ) ===
                                    String(
                                      asset.id
                                    )
                                );

                              return (
                                <div
                                  key={
                                    asset.id
                                  }
                                  className="missing-asset-row"
                                >
                                  <span>
                                    {
                                      asset.assetNumber
                                    }

                                    {asset.serialNumber
                                      ? ` · ${asset.serialNumber}`
                                      : ""}
                                  </span>

                                  {returned ? (
                                    <em>
                                      Scanned
                                      for
                                      return
                                    </em>
                                  ) : missing ? (
                                    <div>
                                      <em>
                                        Missing
                                        incident
                                        pending
                                      </em>

                                      <input
                                        type="text"
                                        maxLength="500"
                                        value={
                                          missing.reason ||
                                          ""
                                        }
                                        placeholder="Reason (at least 5 characters)"
                                        onChange={(
                                          event
                                        ) =>
                                          updateMissingReason(
                                            asset.id,
                                            event
                                              .target
                                              .value
                                          )
                                        }
                                      />

                                      <button
                                        type="button"
                                        onClick={() =>
                                          setMissingAssets(
                                            (
                                              current
                                            ) =>
                                              current.filter(
                                                (
                                                  entry
                                                ) =>
                                                  String(
                                                    entry.assetId
                                                  ) !==
                                                  String(
                                                    asset.id
                                                  )
                                              )
                                          )
                                        }
                                      >
                                        Undo
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      type="button"
                                      className="danger-text"
                                      onClick={() =>
                                        reportMissing(
                                          asset,
                                          item.inventoryId
                                        )
                                      }
                                    >
                                      Report
                                      Missing
                                    </button>
                                  )}
                                </div>
                              );
                            }
                          )}
                        </div>
                      ))}

                    {/* ------------------------------------------ */}
                    {/* NORMAL / NON-SERIALIZED ITEMS */}
                    {/* ------------------------------------------ */}

                    {returnForm.items.map(
                      (
                        item,
                        index
                      ) => {
                        const sourceItem =
                          returnRequest.items.find(
                            (entry) =>
                              String(
                                entry.inventoryId
                              ) ===
                              String(
                                item.inventoryId
                              )
                          );

                        const isSerialized =
                          sourceItem?.trackingType ===
                          "serialized";

                        return (
                          <section
                            className="qr-return-item"
                            key={
                              item.inventoryId
                            }
                          >
                            <div className="return-item-heading">
                              <strong>
                                {
                                  item.name
                                }
                              </strong>

                              <span>
                                {
                                  item.outstandingQuantity
                                }{" "}
                                outstanding
                              </span>
                            </div>

                            <div className="return-fields">
                              {[
                                [
                                  "goodQuantity",
                                  "Good",
                                ],
                                [
                                  "damagedQuantity",
                                  "Damaged",
                                ],
                                [
                                  "missingQuantity",
                                  "Missing",
                                ],
                              ].map(
                                ([
                                  field,
                                  label,
                                ]) => (
                                  <label
                                    key={
                                      field
                                    }
                                  >
                                    {
                                      label
                                    }

                                    <input
                                      type="number"
                                      min="0"
                                      max={
                                        item.outstandingQuantity
                                      }
                                      disabled={
                                        isSerialized
                                      }
                                      value={
                                        item[
                                          field
                                        ]
                                      }
                                      onChange={(
                                        event
                                      ) =>
                                        updateReturnItem(
                                          index,
                                          field,
                                          Number(
                                            event
                                              .target
                                              .value
                                          )
                                        )
                                      }
                                    />
                                  </label>
                                )
                              )}
                            </div>

                            <label>
                              Condition
                              note{" "}
                              {(Number(
                                item.damagedQuantity ||
                                  0
                              ) >
                                0 ||
                                Number(
                                  item.missingQuantity ||
                                    0
                                ) >
                                  0) && (
                                <span className="required-note">
                                  Required
                                </span>
                              )}

                              <input
                                type="text"
                                maxLength="500"
                                value={
                                  item.conditionNote ||
                                  ""
                                }
                                placeholder={
                                  isSerialized
                                    ? "Serialized asset notes are recorded individually."
                                    : "Required for damaged or missing units"
                                }
                                disabled={
                                  isSerialized
                                }
                                onChange={(
                                  event
                                ) =>
                                  updateReturnItem(
                                    index,
                                    "conditionNote",
                                    event
                                      .target
                                      .value
                                  )
                                }
                              />
                            </label>
                          </section>
                        );
                      }
                    )}

                    {/* ------------------------------------------ */}
                    {/* REMARKS */}
                    {/* ------------------------------------------ */}

                    <label>
                      Return remarks

                      <textarea
                        rows="3"
                        maxLength="1000"
                        value={
                          returnForm.remarks ||
                          ""
                        }
                        onChange={(
                          event
                        ) =>
                          setReturnForm(
                            (
                              current
                            ) => ({
                              ...current,
                              remarks:
                                event
                                  .target
                                  .value,
                            })
                          )
                        }
                      />
                    </label>

                    {/* ------------------------------------------ */}
                    {/* SUBMIT */}
                    {/* ------------------------------------------ */}

                    <button
                      className="release-button"
                      type="submit"
                      disabled={busy}
                    >
                      {busy
                        ? "Recording return..."
                        : "Record Return"}
                    </button>
                  </form>
                )}

              {/* ------------------------------------------------ */}
              {/* NO REQUESTS */}
              {/* ------------------------------------------------ */}

              {Array.isArray(
                result.requests
              ) &&
                result.requests.length ===
                  0 && (
                  <div className="empty-return-state">
                    No active borrowing
                    requests were found for
                    this QR code.
                  </div>
                )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
