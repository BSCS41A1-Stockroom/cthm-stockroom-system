
"use strict";

const pool = require("../config/db");

function normalizeSection(body = {}) {
    return {
        departmentId:
            body.departmentId ??
            body.department_id ??
            null,

        name: String(
            body.name ?? ""
        ).trim(),

        isActive:
            body.isActive ??
            body.is_active ??
            true,
    };
}

function validateSection(section) {
    const errors = [];

    if (
        !/^[1-9]\d*$/.test(
            String(section.departmentId ?? "")
        )
    ) {
        errors.push(
            "An active department is required."
        );
    }

    if (!section.name) {
        errors.push(
            "Section name is required."
        );
    }

    if (section.name.length > 100) {
        errors.push(
            "Section name cannot exceed 100 characters."
        );
    }

    if (
        typeof section.isActive !==
        "boolean"
    ) {
        errors.push(
            "Section status is invalid."
        );
    }

    return errors;
}

async function departmentExists(
    departmentId
) {
    const result = await pool.query(
        `
        SELECT 1
        FROM public.academic_departments
        WHERE id = $1
          AND is_active = true
        `,
        [departmentId]
    );

    return result.rowCount > 0;
}

async function listSections(
    req,
    res,
    next
) {
    try {
        const result = await pool.query(
            `
            SELECT
                section.id,
                section.department_id,
                department.code AS department_code,
                department.name AS department_name,
                section.name,
                section.is_active,
                section.created_at,
                section.updated_at

            FROM public.academic_sections section

            JOIN public.academic_departments department
                ON department.id =
                    section.department_id

            ORDER BY
                department.name,
                section.name
            `
        );

        return res.json({
            sections: result.rows,
        });
    } catch (error) {
        return next(error);
    }
}

async function createSection(
    req,
    res,
    next
) {
    const section =
        normalizeSection(req.body);

    const errors =
        validateSection(section);

    if (errors.length) {
        return res.status(422).json({
            error: "INVALID_SECTION",
            reasons: errors,
        });
    }

    try {
        if (
            !(await departmentExists(
                section.departmentId
            ))
        ) {
            return res.status(422).json({
                error:
                    "INVALID_DEPARTMENT",
                message:
                    "Select an active department.",
            });
        }

        const result =
            await pool.query(
                `
                INSERT INTO
                    public.academic_sections
                    (
                        department_id,
                        name,
                        is_active
                    )
                VALUES
                    ($1, $2, $3)
                RETURNING *
                `,
                [
                    section.departmentId,
                    section.name,
                    section.isActive,
                ]
            );

        return res.status(201).json({
            section:
                result.rows[0],
        });
    } catch (error) {
        if (
            error.code === "23505"
        ) {
            return res.status(409).json({
                error:
                    "SECTION_EXISTS",
                message:
                    "That section already exists under the selected department.",
            });
        }

        return next(error);
    }
}

async function updateSection(
    req,
    res,
    next
) {
    if (
        !/^[1-9]\d*$/.test(
            req.params.id
        )
    ) {
        return res.status(400).json({
            error:
                "INVALID_SECTION_ID",
            message:
                "Section ID is invalid.",
        });
    }

    const section =
        normalizeSection(req.body);

    const errors =
        validateSection(section);

    if (errors.length) {
        return res.status(422).json({
            error: "INVALID_SECTION",
            reasons: errors,
        });
    }

    try {
        if (
            !(await departmentExists(
                section.departmentId
            ))
        ) {
            return res.status(422).json({
                error:
                    "INVALID_DEPARTMENT",
                message:
                    "Select an active department.",
            });
        }

        const result =
            await pool.query(
                `
                UPDATE
                    public.academic_sections

                SET
                    department_id = $2,
                    name = $3,
                    is_active = $4,
                    updated_at = now()

                WHERE id = $1

                RETURNING *
                `,
                [
                    req.params.id,
                    section.departmentId,
                    section.name,
                    section.isActive,
                ]
            );

        if (!result.rowCount) {
            return res.status(404).json({
                error:
                    "SECTION_NOT_FOUND",
                message:
                    "Section was not found.",
            });
        }

        return res.json({
            section:
                result.rows[0],
        });
    } catch (error) {
        if (
            error.code === "23505"
        ) {
            return res.status(409).json({
                error:
                    "SECTION_EXISTS",
                message:
                    "That section already exists under the selected department.",
            });
        }

        return next(error);
    }
}

async function deleteSection(
    req,
    res,
    next
) {
    if (
        !/^[1-9]\d*$/.test(
            req.params.id
        )
    ) {
        return res.status(400).json({
            error:
                "INVALID_SECTION_ID",
            message:
                "Section ID is invalid.",
        });
    }

    try {
        /*
         * First check if a professor or
         * another profile is currently
         * assigned to this section.
         */
        const assigned =
            await pool.query(
                `
                SELECT COUNT(*)::int AS count
                FROM public.profiles
                WHERE section_id = $1
                `,
                [req.params.id]
            );

        if (
            assigned.rows[0].count > 0
        ) {
            return res.status(409).json({
                error:
                    "SECTION_IN_USE",
                message:
                    "This section cannot be deleted because it is currently assigned to one or more users. Deactivate it instead.",
            });
        }

        const result =
            await pool.query(
                `
                DELETE FROM
                    public.academic_sections

                WHERE id = $1

                RETURNING id
                `,
                [req.params.id]
            );

        if (!result.rowCount) {
            return res.status(404).json({
                error:
                    "SECTION_NOT_FOUND",
                message:
                    "Section was not found.",
            });
        }

        return res.json({
            message:
                "Section deleted successfully.",
            id: result.rows[0].id,
        });
    } catch (error) {
        if (
            error.code === "23503"
        ) {
            return res.status(409).json({
                error:
                    "SECTION_IN_USE",
                message:
                    "This section is currently referenced by another record. Deactivate it instead of deleting it.",
            });
        }

        return next(error);
    }
}

module.exports = {
    listSections,
    createSection,
    updateSection,
    deleteSection,
};

